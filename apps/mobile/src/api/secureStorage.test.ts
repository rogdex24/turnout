import { memoryKv } from "./prefs";
import { ensureCacheKey, forgetSecretsFromAnOldInstall, INSTALL_KEY, memorySecretStore, SECRET_KEYS } from "./secureStorage";

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

describe("forgetSecretsFromAnOldInstall", () => {
  test("a new install empties the keychain the last install left, then marks the install", async () => {
    const secure = memorySecretStore({ [SECRET_KEYS.refreshToken]: "old", [SECRET_KEYS.cacheKey]: "k".repeat(32), other: "kept" });
    const install = memoryKv();
    await forgetSecretsFromAnOldInstall(secure, install);
    expect(secure.dump()).toEqual({ other: "kept" });
    expect(install.getString(INSTALL_KEY)).toBe("1");
  });

  test("a marked install keeps the keychain, so a sign-in survives the next start", async () => {
    const secure = memorySecretStore({ [SECRET_KEYS.refreshToken]: "current" });
    const install = memoryKv();
    install.set(INSTALL_KEY, "1");
    await forgetSecretsFromAnOldInstall(secure, install);
    expect(secure.dump()).toEqual({ [SECRET_KEYS.refreshToken]: "current" });
  });
});
