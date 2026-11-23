export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    const objectId = value as { toHexString?: unknown; constructor?: { name?: string } };
    if (objectId.constructor?.name === "ObjectId" && typeof objectId.toHexString === "function") {
      return objectId.toHexString();
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)]));
  }
  return value;
}
