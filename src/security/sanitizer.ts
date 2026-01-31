import { getDefaultRedactPatterns } from "../logging/redact.js";

const REPLACEMENT = "****";
const ENV_KEY_PATTERNS = [/KEY/, /TOKEN/, /SECRET/, /PASS/, /PASSWORD/];
const MIN_SECRET_LENGTH = 6;

let cachedEnvSecrets: string[] | null = null;

export function resetSanitizerCache() {
  cachedEnvSecrets = null;
}

function getEnvSecrets(): string[] {
  if (cachedEnvSecrets) return cachedEnvSecrets;

  const secrets: string[] = [];
  const env = process.env as Record<string, string | undefined>;

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.length < MIN_SECRET_LENGTH) continue;

    const isSensitiveKey = ENV_KEY_PATTERNS.some((p) => p.test(key.toUpperCase()));
    if (isSensitiveKey) {
      secrets.push(value);
    }
  }

  cachedEnvSecrets = secrets;
  return secrets;
}

export function sanitizeResponse(text: string | null | undefined): string {
  if (!text) return "";

  let next = text;

  const envSecrets = getEnvSecrets();
  for (const secret of envSecrets) {
    if (next.includes(secret)) {
      next = next.replaceAll(secret, REPLACEMENT);
    }
  }

  const patterns = getDefaultRedactPatterns().map((p) => new RegExp(p, "gi"));

  for (const pattern of patterns) {
    next = next.replace(pattern, (...args: any[]) => {
      const match = args[0] as string;
      const groups = args.slice(1, -2).filter((g) => typeof g === "string");

      if (groups.length > 0) {
        const secret = groups.at(-1)!;
        if (secret && match.includes(secret)) {
          return match.replace(secret, REPLACEMENT);
        }
      }
      return REPLACEMENT;
    });
  }

  return next;
}
