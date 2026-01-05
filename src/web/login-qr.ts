import { randomUUID } from "node:crypto";

import { DisconnectReason } from "@whiskeysockets/baileys";

import { danger, info, success } from "../globals.js";
import { logInfo } from "../logger.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { renderQrPngBase64 } from "./qr-image.js";
import {
  createWaSocket,
  formatError,
  getStatusCode,
  logoutWeb,
  readWebSelfId,
  waitForWaConnection,
  webAuthExists,
} from "./session.js";

type WaSocket = Awaited<ReturnType<typeof createWaSocket>>;

type ActiveLogin = {
  id: string;
  sock: WaSocket;
  startedAt: number;
  qr?: string;
  qrDataUrl?: string;
  connected: boolean;
  error?: string;
  errorStatus?: number;
  waitPromise: Promise<void>;
  restartAttempted: boolean;
  verbose: boolean;
};

const ACTIVE_LOGIN_TTL_MS = 3 * 60_000;
let activeLogin: ActiveLogin | null = null;

function closeSocket(sock: WaSocket) {
  try {
    sock.ws?.close();
  } catch {
    // ignore
  }
}

async function resetActiveLogin(reason?: string) {
  if (activeLogin) {
    closeSocket(activeLogin.sock);
    activeLogin = null;
  }
  if (reason) {
    logInfo(reason);
  }
}

function isLoginFresh(login: ActiveLogin) {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}

function attachLoginWaiter(login: ActiveLogin) {
  login.waitPromise = waitForWaConnection(login.sock)
    .then(() => {
      if (activeLogin?.id === login.id) {
        activeLogin.connected = true;
      }
    })
    .catch((err) => {
      if (activeLogin?.id === login.id) {
        activeLogin.error = formatError(err);
        activeLogin.errorStatus = getStatusCode(err);
      }
    });
}

async function restartLoginSocket(login: ActiveLogin, runtime: RuntimeEnv) {
  if (login.restartAttempted) return false;
  login.restartAttempted = true;
  runtime.log(
    info(
      "WhatsApp asked for a restart after pairing (code 515); retrying connection once…",
    ),
  );
  closeSocket(login.sock);
  try {
    const sock = await createWaSocket(false, login.verbose);
    login.sock = sock;
    login.connected = false;
    login.error = undefined;
    login.errorStatus = undefined;
    attachLoginWaiter(login);
    return true;
  } catch (err) {
    login.error = formatError(err);
    login.errorStatus = getStatusCode(err);
    return false;
  }
}

export async function startWebLoginWithQr(
  opts: {
    verbose?: boolean;
    timeoutMs?: number;
    force?: boolean;
    runtime?: RuntimeEnv;
  } = {},
): Promise<{ qrDataUrl?: string; message: string }> {
  const runtime = opts.runtime ?? defaultRuntime;
  const hasWeb = await webAuthExists();
  const selfId = readWebSelfId();
  if (hasWeb && !opts.force) {
    const who = selfId.e164 ?? selfId.jid ?? "unknown";
    return {
      message: `WhatsApp is already linked (${who}). Say “relink” if you want a fresh QR.`,
    };
  }

  if (activeLogin && isLoginFresh(activeLogin) && activeLogin.qrDataUrl) {
    return {
      qrDataUrl: activeLogin.qrDataUrl,
      message: "QR already active. Scan it in WhatsApp → Linked Devices.",
    };
  }

  await resetActiveLogin();

  let resolveQr: ((qr: string) => void) | null = null;
  let rejectQr: ((err: Error) => void) | null = null;
  const qrPromise = new Promise<string>((resolve, reject) => {
    resolveQr = resolve;
    rejectQr = reject;
  });

  const qrTimer = setTimeout(
    () => {
      rejectQr?.(new Error("Timed out waiting for WhatsApp QR"));
    },
    Math.max(opts.timeoutMs ?? 30_000, 5000),
  );

  let sock: WaSocket;
  try {
    sock = await createWaSocket(false, Boolean(opts.verbose), {
      onQr: (qr: string) => {
        if (!activeLogin || activeLogin.qr) return;
        activeLogin.qr = qr;
        clearTimeout(qrTimer);
        runtime.log(info("WhatsApp QR received."));
        resolveQr?.(qr);
      },
    });
  } catch (err) {
    clearTimeout(qrTimer);
    await resetActiveLogin();
    return {
      message: `Failed to start WhatsApp login: ${String(err)}`,
    };
  }
  const login: ActiveLogin = {
    id: randomUUID(),
    sock,
    startedAt: Date.now(),
    connected: false,
    waitPromise: Promise.resolve(),
    restartAttempted: false,
    verbose: Boolean(opts.verbose),
  };
  activeLogin = login;
  attachLoginWaiter(login);

  let qr: string;
  try {
    qr = await qrPromise;
  } catch (err) {
    clearTimeout(qrTimer);
    await resetActiveLogin();
    return {
      message: `Failed to get QR: ${String(err)}`,
    };
  }

  const base64 = await renderQrPngBase64(qr);
  login.qrDataUrl = `data:image/png;base64,${base64}`;
  return {
    qrDataUrl: login.qrDataUrl,
    message: "Scan this QR in WhatsApp → Linked Devices.",
  };
}

export async function waitForWebLogin(
  opts: { timeoutMs?: number; runtime?: RuntimeEnv } = {},
): Promise<{ connected: boolean; message: string }> {
  const runtime = opts.runtime ?? defaultRuntime;
  if (!activeLogin) {
    return {
      connected: false,
      message: "No active WhatsApp login in progress.",
    };
  }

  const login = activeLogin;
  if (!isLoginFresh(login)) {
    await resetActiveLogin();
    return {
      connected: false,
      message: "The login QR expired. Ask me to generate a new one.",
    };
  }
  const timeoutMs = Math.max(opts.timeoutMs ?? 120_000, 1000);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return {
        connected: false,
        message:
          "Still waiting for the QR scan. Let me know when you’ve scanned it.",
      };
    }
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), remaining),
    );
    const result = await Promise.race([
      login.waitPromise.then(() => "done"),
      timeout,
    ]);

    if (result === "timeout") {
      return {
        connected: false,
        message:
          "Still waiting for the QR scan. Let me know when you’ve scanned it.",
      };
    }

    if (login.error) {
      if (login.errorStatus === DisconnectReason.loggedOut) {
        await logoutWeb(runtime);
        const message =
          "WhatsApp reported the session is logged out. Cleared cached web session; please scan a new QR.";
        await resetActiveLogin(message);
        runtime.log(danger(message));
        return { connected: false, message };
      }
      if (login.errorStatus === 515) {
        const restarted = await restartLoginSocket(login, runtime);
        if (restarted && isLoginFresh(login)) {
          continue;
        }
      }
      const message = `WhatsApp login failed: ${login.error}`;
      await resetActiveLogin(message);
      runtime.log(danger(message));
      return { connected: false, message };
    }

    if (login.connected) {
      const message = "✅ Linked! WhatsApp is ready.";
      runtime.log(success(message));
      await resetActiveLogin();
      return { connected: true, message };
    }

    return { connected: false, message: "Login ended without a connection." };
  }
}
