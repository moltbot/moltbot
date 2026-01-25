/**
 * リプライ形式の型定義
 *
 * チ�泊メッセージングプラットフォームへの引用返信を統一的に扱う
 */

/**
 * レスポンス形式
 */
export const ResponseFormat = {
  /** テキストのみ */
  TEXT: "text",
  /** 埋め込み (Discord) */
  EMBED: "embed",
  /** ファイル添付 */
  FILE: "file",
  /** Flex Message (LINE) */
  FLEX: "flex",
} as const;

export type ResponseFormat = (typeof ResponseFormat)[keyof typeof ResponseFormat];

/**
 * リプライオプション
 */
export interface ReplyOptions {
  /** レスポンス形式 */
  format?: ResponseFormat;
  /** メンション設定 */
  allowedMentions?: {
    /** メンションするユーザー */
    users?: boolean | string[];
    /** メンションする役割 */
    roles?: boolean | string[];
    /** 全体メンション */
    everyone?: boolean;
  };
  /** ファイルURL */
  fileUrls?: string[];
  /** 埋め込みデータ */
  embeds?: ReplyEmbed[];
  /** タイムスタンプ（引用元） */
  timestamp?: number;
  /** 送信者情報（引用元） */
  author?: ReplyAuthor;
}

/**
 * 埋め込みデータ
 */
export interface ReplyEmbed {
  /** タイトル */
  title?: string;
  /** 説明 */
  description?: string;
  /** URL */
  url?: string;
  /** 色 */
  color?: number;
  /** フィールド */
  fields?: ReplyEmbedField[];
  /** フッター */
  footer?: ReplyEmbedFooter;
  /** 画像URL */
  imageUrl?: string;
  /** サムネイルURL */
  thumbnailUrl?: string;
}

/**
 * 埋め込みフィールド
 */
export interface ReplyEmbedField {
  /** 名前 */
  name: string;
  /** 値 */
  value: string;
  /** インライン表示 */
  inline?: boolean;
}

/**
 * 埋め込みフッター
 */
export interface ReplyEmbedFooter {
  /** テキスト */
  text: string;
  /** アイコンURL */
  iconUrl?: string;
}

/**
 * 送信者情報
 */
export interface ReplyAuthor {
  /** 表示名 */
  name: string;
  /** ユーザーID */
  userId?: string;
  /** アバターデータ */
  avatarUrl?: string;
  /** ボット判定 */
  bot?: boolean;
}

/**
 * 引用メタデータ
 */
export interface QuoteMetadata {
  /** 元メッセージID */
  messageId: string;
  /** 元メッセージテキスト */
  originalText: string;
  /** 送信者情報 */
  author: ReplyAuthor;
  /** タイムスタンプ */
  timestamp: number;
  /** チャンネル情報 */
  channel?: {
    id: string;
    name: string;
  };
}

/**
 * リプライデータ
 */
export interface ReplyData {
  /** 返信テキスト */
  text?: string;
  /** オプション */
  options?: ReplyOptions;
  /** 成果物URL (セッション永続化された成果物) */
  artifactUrls?: string[];
}
