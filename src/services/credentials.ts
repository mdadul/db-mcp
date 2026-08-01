/**
 * AES-256-GCM credential encryption / decryption.
 *
 * The ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 * It is read from the environment and is never stored, logged, or returned
 * by any API response.
 */

const ALGORITHM = "AES-GCM";
const KEY_BYTES = 32;

export interface EncryptedPayload {
  iv: string; // 12-byte nonce, hex-encoded
  tag: string; // 16-byte GCM auth tag, hex-encoded
  ciphertext: string; // hex-encoded ciphertext
}

function getKeyHex(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  if (Buffer.from(key, "hex").length !== KEY_BYTES) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return key;
}

async function importKey(hex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    Buffer.from(hex, "hex"),
    ALGORITHM,
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(plaintext: string): Promise<EncryptedPayload> {
  const key = await importKey(getKeyHex());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  // AES-GCM output = ciphertext ‖ 16-byte auth tag
  const raw = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded)
  );

  const ciphertext = raw.slice(0, raw.length - 16);
  const tag = raw.slice(raw.length - 16);

  return {
    iv: Buffer.from(iv).toString("hex"),
    tag: Buffer.from(tag).toString("hex"),
    ciphertext: Buffer.from(ciphertext).toString("hex"),
  };
}

export async function decrypt(payload: EncryptedPayload): Promise<string> {
  const key = await importKey(getKeyHex());
  const iv = Buffer.from(payload.iv, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");
  const tag = Buffer.from(payload.tag, "hex");

  // WebCrypto expects ciphertext ‖ tag concatenated
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(new Uint8Array(ciphertext));
  combined.set(new Uint8Array(tag), ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    combined
  );

  return new TextDecoder().decode(decrypted);
}
