/**
 * 成果物管理マネージャー
 *
 * S3 + DynamoDBでθサイクルの成果物を保存・配信する
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, DescribeTableCommand, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  Artifact,
  ArtifactMetadata,
  ArtifactType,
  SaveArtifactOptions,
  DownloadUrlOptions,
  ArtifactFilter,
} from "./types.js";

/** デフォルトTTL (24時間) */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/** デフォルトURL有効期限 (1時間) */
const DEFAULT_URL_EXPIRES_SECONDS = 60 * 60;

/** テーブル名 */
const ARTIFACTS_TABLE = process.env.ARTIFACTS_TABLE_NAME || "clawdbot-artifacts";

/** S3バケット */
const S3_BUCKET = process.env.ARTIFACTS_S3_BUCKET || "clawdbot-artifacts";

/** DynamoDBクライアント */
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

/** S3クライアント */
const s3Client = new S3Client({});

/**
 * テーブル初期化（開発環境用）
 */
export async function initializeTable(): Promise<void> {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: ARTIFACTS_TABLE }));
    console.log(`[ArtifactManager] Table ${ARTIFACTS_TABLE} exists`);
  } catch {
    console.log(`[ArtifactManager] Creating table ${ARTIFACTS_TABLE}`);
    await ddbClient.send(
      new CreateTableCommand({
        TableName: ARTIFACTS_TABLE,
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "sessionId", AttributeType: "S" },
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "type", AttributeType: "S" },
          { AttributeName: "expiresAt", AttributeType: "N" },
        ],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "SessionIndex",
            KeySchema: [
              { AttributeName: "sessionId", KeyType: "HASH" },
              { AttributeName: "createdAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "UserIndex",
            KeySchema: [
              { AttributeName: "userId", KeyType: "HASH" },
              { AttributeName: "createdAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "TypeIndex",
            KeySchema: [
              { AttributeName: "type", KeyType: "HASH" },
              { AttributeName: "expiresAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
        // Note: TTL is configured separately via UpdateTimeToLiveCommand
      }),
    );
    console.log(`[ArtifactManager] Table ${ARTIFACTS_TABLE} created`);
  }
}

/**
 * S3にアップロード
 */
async function uploadToS3(key: string, data: Buffer | string, mimeType: string): Promise<void> {
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  );
}

/**
 * S3から署名付きURLを生成
 */
async function generatePresignedUrl(
  key: string,
  expiresIn: number = DEFAULT_URL_EXPIRES_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * 成果物を保存
 *
 * @param artifact - 成果物データ
 * @param options - 保存オプション
 * @returns ダウンロードURL
 */
export async function save(artifact: Artifact, options: SaveArtifactOptions = {}): Promise<string> {
  const { ttl = DEFAULT_TTL_SECONDS, tags, description, public: isPublic = false } = options;

  const id = `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  const expiresAt = Math.floor(now / 1000) + ttl;

  // S3キー生成: {sessionId}/{type}/{filename} または {type}/{id}/{filename}
  const sessionPrefix = artifact.metadata.sessionId ? `${artifact.metadata.sessionId}/` : "";
  const s3Key = `${sessionPrefix}${artifact.metadata.type}/${id}/${artifact.metadata.filename}`;

  // S3にアップロード
  const data = artifact.buffer ?? artifact.text ?? "";
  await uploadToS3(s3Key, data, artifact.metadata.mimeType);

  // メタデータ構築
  const metadata: ArtifactMetadata = {
    ...artifact.metadata,
    id,
    s3Key,
    s3Bucket: S3_BUCKET,
    createdAt: now,
    expiresAt,
    tags,
    description,
  };

  // DynamoDBに保存
  await ddbDocClient.send(
    new PutCommand({
      TableName: ARTIFACTS_TABLE,
      Item: metadata,
    }),
  );

  // ダウンロードURL生成
  if (isPublic) {
    // 公開URL（S3バケットが公開設定されている場合）
    return `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`;
  }

  return generatePresignedUrl(s3Key);
}

/**
 * 成果物を保存 (ヘルパー)
 *
 * @param sessionId - セッションID
 * @param type - 種類
 * @param filename - ファイル名
 * @param data - データ
 * @param mimeType - MIMEタイプ
 * @param options - オプション
 * @returns ダウンロードURL
 */
export async function saveFile(
  sessionId: string,
  type: ArtifactType,
  filename: string,
  data: Buffer | string,
  mimeType: string,
  options: SaveArtifactOptions = {},
): Promise<string> {
  const size = typeof data === "string" ? data.length : data.length;

  const artifact: Artifact = {
    metadata: {
      sessionId,
      type,
      filename,
      mimeType,
      size,
      createdAt: Date.now(),
      expiresAt: 0, // 一時的な値、save()で上書き
    } as ArtifactMetadata,
    buffer: typeof data === "string" ? undefined : data,
    text: typeof data === "string" ? data : undefined,
  };

  return save(artifact, options);
}

/**
 * ダウンロードURLを取得
 *
 * @param artifactId - 成果物ID
 * @param options - オプション
 * @returns ダウンロードURL、存在しない場合はnull
 */
export async function getDownloadUrl(
  artifactId: string,
  options: DownloadUrlOptions = {},
): Promise<string | null> {
  const { expires = DEFAULT_URL_EXPIRES_SECONDS } = options;

  const response = await ddbDocClient.send(
    new GetCommand({
      TableName: ARTIFACTS_TABLE,
      Key: { id: artifactId },
    }),
  );

  if (!response.Item) {
    return null;
  }

  const metadata = response.Item as unknown as ArtifactMetadata;

  // 期限切れチェック
  if (Date.now() > metadata.expiresAt * 1000) {
    return null;
  }

  return generatePresignedUrl(metadata.s3Key, expires);
}

/**
 * 成果物を取得
 *
 * @param artifactId - 成果物ID
 * @returns メタデータ、存在しない場合はnull
 */
export async function get(artifactId: string): Promise<ArtifactMetadata | null> {
  const response = await ddbDocClient.send(
    new GetCommand({
      TableName: ARTIFACTS_TABLE,
      Key: { id: artifactId },
    }),
  );

  if (!response.Item) {
    return null;
  }

  const metadata = response.Item as unknown as ArtifactMetadata;

  // 期限切れチェック
  if (Date.now() > metadata.expiresAt * 1000) {
    return null;
  }

  return metadata;
}

/**
 * セッションの成果物を一覧取得
 *
 * @param sessionId - セッションID
 * @returns 成果物メタデータ一覧
 */
export async function listBySession(sessionId: string): Promise<ArtifactMetadata[]> {
  const response = await ddbDocClient.send(
    new QueryCommand({
      TableName: ARTIFACTS_TABLE,
      IndexName: "SessionIndex",
      KeyConditionExpression: "sessionId = :sessionId",
      ExpressionAttributeValues: {
        ":sessionId": sessionId,
      },
    }),
  );

  const items = (response.Items as unknown as ArtifactMetadata[]) || [];

  // 期限切れを除外
  return items.filter((item) => Date.now() <= item.expiresAt * 1000);
}

/**
 * ユーザーの成果物を一覧取得
 *
 * @param userId - ユーザーID
 * @returns 成果物メタデータ一覧
 */
export async function listByUser(userId: string): Promise<ArtifactMetadata[]> {
  const response = await ddbDocClient.send(
    new QueryCommand({
      TableName: ARTIFACTS_TABLE,
      IndexName: "UserIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    }),
  );

  const items = (response.Items as unknown as ArtifactMetadata[]) || [];

  // 期限切れを除外
  return items.filter((item) => Date.now() <= item.expiresAt * 1000);
}

/**
 * 成果物を削除
 *
 * @param artifactId - 成果物ID
 */
export async function deleteArtifact(artifactId: string): Promise<void> {
  // メタデータ取得
  const metadata = await get(artifactId);
  if (!metadata) {
    return;
  }

  // S3から削除
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: metadata.s3Bucket,
      Key: metadata.s3Key,
    }),
  );

  // DynamoDBから削除
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: ARTIFACTS_TABLE,
      Key: { id: artifactId },
    }),
  );
}

/**
 * セッションの成果物を全削除
 *
 * @param sessionId - セッションID
 */
export async function deleteBySession(sessionId: string): Promise<number> {
  const artifacts = await listBySession(sessionId);

  for (const artifact of artifacts) {
    await deleteArtifact(artifact.id);
  }

  return artifacts.length;
}
