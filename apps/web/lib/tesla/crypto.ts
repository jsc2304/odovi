import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const encoded = process.env.TESLA_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("TESLA_TOKEN_ENCRYPTION_KEY is not configured");
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32) {
    throw new Error("TESLA_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  }
  return value;
}

export function encryptTeslaSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTeslaSecret(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted Tesla secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
