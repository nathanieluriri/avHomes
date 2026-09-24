import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { sessionSecret } from "./env";

/**
 * Encryption at rest for a third party credential an admin pasted into the
 * console, so a database dump alone does not hand over the key.
 *
 * AES-256-GCM, keyed by HKDF over SESSION_SECRET with its own `info` label, so
 * this key is never the one that signs sessions. Rotating SESSION_SECRET makes
 * every sealed value unreadable; `openSecret` then returns null and the owner
 * pastes the key again.
 *
 * Stored form: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */

const VERSION = "v1";
const INFO = "avhomes/settings-secret/v1";

function boxKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", sessionSecret(), "avhomes", INFO, 32));
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", boxKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/** Null for anything that does not authenticate, including a rotated SESSION_SECRET. */
export function openSecret(sealed: string): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", boxKey(), Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
