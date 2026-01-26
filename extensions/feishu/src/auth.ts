import crypto from "node:crypto";

export function decryptFeishuEncrypt(params: { encrypt: string; encryptKey: string }): string {
  const encrypt = params.encrypt.trim();
  const encryptKey = params.encryptKey.trim();
  if (!encrypt) throw new Error("missing encrypt payload");
  if (!encryptKey) throw new Error("missing encryptKey");

  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const raw = Buffer.from(encrypt, "base64");
  if (raw.length < 17) throw new Error("invalid encrypt payload");
  const iv = raw.subarray(0, 16);
  const ciphertext = raw.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return decrypted;
}

export function verifyFeishuSignature(params: {
  rawBody: string;
  encryptKey: string;
  timestamp: string;
  nonce: string;
  signature: string;
}): boolean {
  const rawBody = params.rawBody;
  const encryptKey = params.encryptKey.trim();
  const timestamp = params.timestamp.trim();
  const nonce = params.nonce.trim();
  const signature = params.signature.trim().toLowerCase();
  if (!encryptKey || !timestamp || !nonce || !signature) return false;
  const content = `${timestamp}${nonce}${encryptKey}${rawBody}`;
  const computed = crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
  return computed === signature;
}
