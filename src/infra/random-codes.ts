import { randomBytes, randomInt, randomUUID } from "node:crypto";

const HUMAN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateHumanCode(length = 8): string {
  if (length <= 0) {
    return "";
  }

  let output = "";
  for (let i = 0; i < length; i += 1) {
    const index = randomInt(HUMAN_CODE_ALPHABET.length);
    output += HUMAN_CODE_ALPHABET[index];
  }

  return output;
}

export function generateSecureToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateUUID(): string {
  return randomUUID();
}

export function generateTempSuffix(): string {
  return `${Date.now()}.${randomBytes(4).toString("hex")}`;
}
