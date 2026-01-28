import { spawn, type ChildProcess } from "child_process";
import { extractAndDownloadMedia, type DownloadedMedia } from "./media.js";

export interface NdrMessageMedia {
  path: string;
  mimeType: string | null;
  url: string;
}

export interface NdrBusOptions {
  accountId: string;
  relays: string[];
  ndrPath: string;
  dataDir: string | null;
  onMessage: (chatId: string, messageId: string, senderPubkey: string, text: string, reply: (text: string) => Promise<void>, media?: NdrMessageMedia) => Promise<void>;
  onNewSession?: (chatId: string, theirPubkey: string) => Promise<void>;
  onError?: (error: Error, context: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export interface NdrBusHandle {
  sendMessage: (chatId: string, text: string) => Promise<void>;
  react: (chatId: string, messageId: string, emoji: string) => Promise<void>;
  createInvite: () => Promise<{ inviteUrl: string; inviteId: string }>;
  joinInvite: (inviteUrl: string) => Promise<{ chatId: string; theirPubkey: string }>;
  listChats: () => Promise<Array<{ id: string; their_pubkey: string }>>;
  close: () => void;
  isRunning: () => boolean;
}

/**
 * Start the NDR bus - manages ndr CLI process for listening and sending
 *
 * The `ndr listen` command handles both incoming messages AND invite responses,
 * so we only need a single listener process.
 */
export async function startNdrBus(options: NdrBusOptions): Promise<NdrBusHandle> {
  const {
    relays,
    ndrPath,
    dataDir,
    onMessage,
    onNewSession,
    onError,
    onConnect,
    onDisconnect,
  } = options;

  let listenProcess: ChildProcess | null = null;
  let running = false;

  // Build common args
  const baseArgs: string[] = ["--json"];
  if (dataDir) {
    baseArgs.push("--data-dir", dataDir);
  }

  // ndr manages its own identity in its config.json (auto-generates on first use)

  // Start listening for messages and invite responses (both handled by `ndr listen`)
  const startListening = () => {
    listenProcess = spawn(ndrPath, [...baseArgs, "listen"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    listenProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // Handle incoming messages
          if (json.event === "message") {
            const chatId = json.chat_id;
            const messageId = json.message_id ?? "";
            const senderPubkey = json.from_pubkey;
            const rawContent = json.content;

            // Create reply function
            const reply = async (text: string) => {
              await runNdrCommand(ndrPath, [...baseArgs, "send", chatId, text]);
            };

            // Extract and download any nhash media URLs
            extractAndDownloadMedia(rawContent).then(({ media, textContent }) => {
              const messageMedia = media ? {
                path: media.path,
                mimeType: media.mimeType,
                url: media.url,
              } : undefined;
              // Use textContent (with nhash removed) if media was found, otherwise use raw content
              const content = media ? textContent : rawContent;
              onMessage(chatId, messageId, senderPubkey, content, reply, messageMedia).catch((err) => {
                onError?.(err, "message_handler");
              });
            }).catch((err) => {
              // If media extraction fails, still process the message with raw content
              onMessage(chatId, messageId, senderPubkey, rawContent, reply).catch((handlerErr) => {
                onError?.(handlerErr, "message_handler");
              });
            });
          }

          // Handle new sessions from invite responses
          if (json.event === "session_created") {
            const chatId = json.chat_id;
            const theirPubkey = json.their_pubkey;

            onNewSession?.(chatId, theirPubkey).catch((err) => {
              onError?.(err, "new_session_handler");
            });
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    });

    listenProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text && !text.includes("Listening")) {
        onError?.(new Error(text), "listen_stderr");
      }
    });

    listenProcess.on("exit", (code) => {
      if (running && code !== 0) {
        onError?.(new Error(`ndr listen exited with code ${code}`), "listen_exit");
        setTimeout(() => running && startListening(), 5000);
      }
    });

    listenProcess.on("error", (err) => {
      onError?.(err, "listen_spawn");
    });
  };

  running = true;
  onConnect?.();
  startListening();

  return {
    sendMessage: async (chatId: string, text: string) => {
      const result = await runNdrCommand(ndrPath, [...baseArgs, "send", chatId, text]);
      if (result.status !== "ok") {
        throw new Error(result.error || "Failed to send message");
      }
    },

    react: async (chatId: string, messageId: string, emoji: string) => {
      const result = await runNdrCommand(ndrPath, [...baseArgs, "react", chatId, messageId, emoji]);
      if (result.status !== "ok") {
        throw new Error(result.error || "Failed to send reaction");
      }
    },

    createInvite: async () => {
      const result = await runNdrCommand(ndrPath, [...baseArgs, "invite", "create"]);
      if (result.status !== "ok") {
        throw new Error(result.error || "Failed to create invite");
      }
      const data = result.data as { url: string; id: string };
      return { inviteUrl: data.url, inviteId: data.id };
    },

    joinInvite: async (inviteUrl: string) => {
      const result = await runNdrCommand(ndrPath, [...baseArgs, "chat", "join", inviteUrl]);
      if (result.status !== "ok") {
        throw new Error(result.error || "Failed to join invite");
      }
      const data = result.data as { id: string; their_pubkey: string };
      return { chatId: data.id, theirPubkey: data.their_pubkey };
    },

    listChats: async () => {
      const result = await runNdrCommand(ndrPath, [...baseArgs, "chat", "list"]);
      if (result.status === "ok" && result.data) {
        const data = result.data as { chats: Array<{ id: string; their_pubkey: string }> };
        return data.chats || [];
      }
      return [];
    },

    close: () => {
      running = false;
      onDisconnect?.();
      if (listenProcess) {
        listenProcess.kill();
        listenProcess = null;
      }
    },

    isRunning: () => running,
  };
}

/**
 * Run an ndr CLI command and return parsed JSON output
 */
async function runNdrCommand(ndrPath: string, args: string[]): Promise<{ status: string; error?: string; data?: unknown }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ndrPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        try {
          const json = JSON.parse(stdout.trim());
          resolve(json);
        } catch {
          resolve({ status: "ok", data: stdout.trim() });
        }
      } else {
        resolve({ status: "error", error: stderr.trim() || `Exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Get chat list from ndr
 */
export async function listChats(ndrPath: string, dataDir: string | null): Promise<Array<{ id: string; their_pubkey: string }>> {
  const args = ["--json"];
  if (dataDir) {
    args.push("--data-dir", dataDir);
  }
  args.push("chat", "list");

  const result = await runNdrCommand(ndrPath, args);
  if (result.status === "ok" && Array.isArray(result.data)) {
    return result.data as Array<{ id: string; their_pubkey: string }>;
  }
  return [];
}

/**
 * Join a chat via invite URL
 */
export async function joinChat(
  ndrPath: string,
  dataDir: string | null,
  inviteUrl: string
): Promise<{ chatId: string; theirPubkey: string }> {
  const args = ["--json"];
  if (dataDir) {
    args.push("--data-dir", dataDir);
  }
  args.push("chat", "join", inviteUrl);

  const result = await runNdrCommand(ndrPath, args);
  if (result.status !== "ok") {
    throw new Error(result.error || "Failed to join chat");
  }

  const data = result.data as { id: string; their_pubkey: string };
  return { chatId: data.id, theirPubkey: data.their_pubkey };
}

/**
 * Create an invite
 */
export async function createInvite(
  ndrPath: string,
  dataDir: string | null
): Promise<{ inviteUrl: string; inviteId: string }> {
  const args = ["--json"];
  if (dataDir) {
    args.push("--data-dir", dataDir);
  }
  args.push("invite", "create");

  const result = await runNdrCommand(ndrPath, args);
  if (result.status !== "ok") {
    throw new Error(result.error || "Failed to create invite");
  }

  const data = result.data as { url: string; id: string };
  return { inviteUrl: data.url, inviteId: data.id };
}
