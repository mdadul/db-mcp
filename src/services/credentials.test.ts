import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "./credentials.ts";

// Must be set before any test calls encrypt/decrypt.
// getKeyHex() reads process.env at call time, not at import time.
process.env.ENCRYPTION_KEY = "a".repeat(64); // 32 bytes as hex

describe("encrypt / decrypt", () => {
  test("round-trip returns original plaintext", async () => {
    const plaintext = "my-secret-password!@#$%";
    const payload = await encrypt(plaintext);
    const result = await decrypt(payload);
    assert.equal(result, plaintext);
  });

  test("produces unique IV and ciphertext on each call", async () => {
    const [a, b] = await Promise.all([encrypt("same"), encrypt("same")]);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  test("payload contains iv, tag, and ciphertext hex strings", async () => {
    const payload = await encrypt("hello");
    assert.match(payload.iv, /^[0-9a-f]{24}$/); // 12 bytes
    assert.match(payload.tag, /^[0-9a-f]{32}$/); // 16 bytes
    assert.ok(payload.ciphertext.length > 0);
  });

  test("decrypt throws when ciphertext is tampered", async () => {
    const payload = await encrypt("secret");
    const tampered = { ...payload, ciphertext: "dead".repeat(payload.ciphertext.length / 4) };
    await assert.rejects(() => decrypt(tampered));
  });

  test("decrypt throws when tag is tampered", async () => {
    const payload = await encrypt("secret");
    const tampered = { ...payload, tag: "ff".repeat(16) };
    await assert.rejects(() => decrypt(tampered));
  });

  test("decrypt throws when IV is wrong", async () => {
    const payload = await encrypt("secret");
    const tampered = { ...payload, iv: "00".repeat(12) };
    await assert.rejects(() => decrypt(tampered));
  });
});

describe("ENCRYPTION_KEY validation", () => {
  const original = process.env.ENCRYPTION_KEY;

  after(() => {
    process.env.ENCRYPTION_KEY = original;
  });

  test("throws when ENCRYPTION_KEY is missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    await assert.rejects(() => encrypt("test"), /ENCRYPTION_KEY/);
  });

  test("throws when ENCRYPTION_KEY is wrong length", async () => {
    process.env.ENCRYPTION_KEY = "tooshort";
    await assert.rejects(() => encrypt("test"), /64-character/);
  });
});
