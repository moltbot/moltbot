/**
 * セッション永続化マネージャー
 *
 * DynamoDBを使用してθサイクルのセッション状態を永続化・復元する
 * Fly.io/Lambda再起動時の処理再開に対応
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  PersistedSessionState,
  SessionMetadata,
  SessionStatus,
  SaveStateOptions,
  PendingSessionsFilter,
  RestoredSession,
} from "./types.js";
import { SessionStatus as Status } from "./types.js";

/** デフォルトTTL (1時間) */
const DEFAULT_TTL_SECONDS = 60 * 60;

/** テーブル名 */
const SESSIONS_TABLE = process.env.SESSIONS_TABLE_NAME || "clawdbot-sessions";

/** DynamoDBクライアント */
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * テーブル初期化（開発環境用）
 *
 * 本番環境ではTerraform/CloudFormation等で管理
 */
export async function initializeTable(): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: SESSIONS_TABLE }));
    console.log(`[SessionManager] Table ${SESSIONS_TABLE} exists`);
  } catch {
    // テーブルが存在しない場合は作成（開発環境のみ）
    console.log(`[SessionManager] Creating table ${SESSIONS_TABLE}`);
    await client.send(
      new CreateTableCommand({
        TableName: SESSIONS_TABLE,
        AttributeDefinitions: [
          { AttributeName: "sessionId", AttributeType: "S" },
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "guildId", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
          { AttributeName: "expiresAt", AttributeType: "N" },
        ],
        KeySchema: [{ AttributeName: "sessionId", KeyType: "HASH" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "UserIndex",
            KeySchema: [
              { AttributeName: "userId", KeyType: "HASH" },
              { AttributeName: "status", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "GuildIndex",
            KeySchema: [
              { AttributeName: "guildId", KeyType: "HASH" },
              { AttributeName: "status", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "PendingIndex",
            KeySchema: [
              { AttributeName: "status", KeyType: "HASH" },
              { AttributeName: "expiresAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
        // Note: TTL is configured separately via UpdateTimeToLiveCommand
      }),
    );
    console.log(`[SessionManager] Table ${SESSIONS_TABLE} created`);
  }
}

/**
 * セッション状態を保存
 *
 * @param sessionId - セッションID
 * @param state - θサイクル状態
 * @param options - 保存オプション
 */
export async function saveState(
  sessionId: string,
  state: PersistedSessionState,
  options: SaveStateOptions = {},
): Promise<void> {
  const ttl = options.ttl ?? DEFAULT_TTL_SECONDS;
  const now = Date.now();
  const expiresAt = Math.floor(now / 1000) + ttl;

  const metadata: SessionMetadata = {
    ...state.metadata,
    sessionId,
    lastUpdateTime: now,
    expiresAt,
  };

  await docClient.send(
    new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        ...metadata,
        thetaState: state.thetaState,
        context: state.context,
        error: options.includeError ? state.error : undefined,
      },
    }),
  );
}

/**
 * セッション状態を復元
 *
 * @param sessionId - セッションID
 * @returns 復元されたセッション、存在しない場合はnull
 */
export async function restoreState(sessionId: string): Promise<RestoredSession | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }),
  );

  if (!response.Item) {
    return null;
  }

  const state = response.Item as unknown as PersistedSessionState;
  const now = Date.now();
  const elapsed = now - state.metadata.startTime;

  // 期限切れチェック
  if (now > state.metadata.expiresAt * 1000) {
    await deleteSession(sessionId);
    return null;
  }

  return {
    state,
    resumable: state.metadata.status === Status.RUNNING,
    elapsed,
  };
}

/**
 * 未完了セッションを取得
 *
 * @param filter - フィルタ条件
 * @returns 未完了セッション一覧
 */
export async function getPendingSessions(
  filter: PendingSessionsFilter = {},
): Promise<PersistedSessionState[]> {
  const now = Math.floor(Date.now() / 1000);

  // ステータスが指定されている場合はGSIを使用
  if (filter.status) {
    let indexName: string | undefined;
    let keyCondition: string | undefined;
    let expressionValues: Record<string, unknown> = {
      ":status": filter.status,
      ":now": now,
    };

    if (filter.userId) {
      indexName = "UserIndex";
      keyCondition = "userId = :userId AND #status = :status";
      expressionValues[":userId"] = filter.userId;
    } else if (filter.guildId) {
      indexName = "GuildIndex";
      keyCondition = "guildId = :guildId AND #status = :status";
      expressionValues[":guildId"] = filter.guildId;
    } else {
      indexName = "PendingIndex";
      keyCondition = "#status = :status AND expiresAt > :now";
    }

    const response = await docClient.send(
      new QueryCommand({
        TableName: SESSIONS_TABLE,
        IndexName: indexName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: expressionValues,
      }),
    );

    return (response.Items as unknown as PersistedSessionState[]) || [];
  }

  // フィルタなしで全未完了セッションを取得
  const response = await docClient.send(
    new QueryCommand({
      TableName: SESSIONS_TABLE,
      IndexName: "PendingIndex",
      KeyConditionExpression: "#status = :status AND expiresAt > :now",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": Status.RUNNING,
        ":now": now,
      },
    }),
  );

  let items = (response.Items as unknown as PersistedSessionState[]) || [];

  // チャンネルIDでフィルタ
  if (filter.channelId) {
    items = items.filter((s) => s.metadata.channelId === filter.channelId);
  }

  return items;
}

/**
 * セッションを削除
 *
 * @param sessionId - セッションID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }),
  );
}

/**
 * セッションステータスを更新
 *
 * @param sessionId - セッションID
 * @param status - 新しいステータス
 */
export async function updateStatus(sessionId: string, status: SessionStatus): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
      UpdateExpression: "SET #status = :status, #updated = :updated",
      ExpressionAttributeNames: {
        "#status": "status",
        "#updated": "lastUpdateTime",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":updated": Date.now(),
      },
    }),
  );
}

/**
 * 期限切れセッションをクリーンアップ
 *
 * 手動クリーンアップ用。通常はTTLにより自動削除される。
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  const response = await docClient.send(
    new QueryCommand({
      TableName: SESSIONS_TABLE,
      IndexName: "PendingIndex",
      KeyConditionExpression: "#status = :status AND expiresAt < :now",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": Status.RUNNING,
        ":now": now,
      },
    }),
  );

  const expired = response.Items || [];
  for (const item of expired) {
    await deleteSession(item.sessionId as string);
  }

  return expired.length;
}
