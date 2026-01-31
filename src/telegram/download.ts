import { detectMime } from "../media/mime.js";
import { type SavedMedia, saveMediaBuffer } from "../media/store.js";

export type TelegramFileInfo = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  file_path?: string;
};

export type TelegramDownloadOptions = {
  fetchImpl?: typeof fetch;
};

export class TelegramDownloadError extends Error {
  readonly code: "fetch_failed" | "http_error" | "api_error";

  constructor(code: "fetch_failed" | "http_error" | "api_error", message: string) {
    super(message);
    this.code = code;
    this.name = "TelegramDownloadError";
  }
}

export async function getTelegramFile(
  token: string,
  fileId: string,
  options?: TelegramDownloadOptions,
): Promise<TelegramFileInfo> {
  const fetcher = options?.fetchImpl ?? globalThis.fetch;
  if (!fetcher) {
    throw new TelegramDownloadError(
      "fetch_failed",
      "fetch is not available; set channels.telegram.proxy in config",
    );
  }

  let res: Response;
  try {
    res = await fetcher(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
  } catch (err) {
    throw new TelegramDownloadError(
      "fetch_failed",
      `Failed to fetch Telegram file info: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new TelegramDownloadError(
      "http_error",
      `getFile failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    ok: boolean;
    result?: TelegramFileInfo;
    description?: string;
  };
  if (!json.ok || !json.result?.file_path) {
    throw new TelegramDownloadError(
      "api_error",
      json.description ?? "getFile returned no file_path",
    );
  }
  return json.result;
}

export async function downloadTelegramFile(
  token: string,
  info: TelegramFileInfo,
  maxBytes?: number,
  options?: TelegramDownloadOptions,
): Promise<SavedMedia> {
  if (!info.file_path) {
    throw new TelegramDownloadError("api_error", "file_path missing");
  }

  const fetcher = options?.fetchImpl ?? globalThis.fetch;
  if (!fetcher) {
    throw new TelegramDownloadError(
      "fetch_failed",
      "fetch is not available; set channels.telegram.proxy in config",
    );
  }

  const url = `https://api.telegram.org/file/bot${token}/${info.file_path}`;

  let res: Response;
  try {
    res = await fetcher(url);
  } catch (err) {
    throw new TelegramDownloadError(
      "fetch_failed",
      `Failed to download Telegram file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok || !res.body) {
    throw new TelegramDownloadError(
      "http_error",
      `Failed to download telegram file: HTTP ${res.status}`,
    );
  }

  const array = Buffer.from(await res.arrayBuffer());
  const mime = await detectMime({
    buffer: array,
    headerMime: res.headers.get("content-type"),
    filePath: info.file_path,
  });
  // save with inbound subdir
  const saved = await saveMediaBuffer(array, mime, "inbound", maxBytes);
  // Ensure extension matches mime if possible
  if (!saved.contentType && mime) saved.contentType = mime;
  return saved;
}
