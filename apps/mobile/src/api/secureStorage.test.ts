import { ensureCacheKey, memorySecretStore, SECRET_KEYS } from "./secureStorage";

describe("ensureCacheKey", () => {
  const bytes = (count: number) => Uint8Array.from({ length: count }, (_, index) => index + 1);

  it("makes a 32 character key and keeps it for next time", async () => {
    const secure = memorySecretStore();
    const first = await ensureCacheKey(secure, bytes);
    expect(first).toHaveLength(32);
    expect(await secure.get(SECRET_KEYS.cacheKey)).toBe(first);
    expect(await ensureCacheKey(secure, () => new Uint8Array(24))).toBe(first);
  });

  it("replaces a key of the wrong size", async () => {
    const secure = memorySecretStore();
    await secure.set(SECRET_KEYS.cacheKey, "short");
    expect(await ensureCacheKey(secure, bytes)).toHaveLength(32);
  });
});
