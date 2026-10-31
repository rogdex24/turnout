import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("deploy files hold the server's transport settings", () => {
  test("every Caddy site sends HSTS for a year, so the app is reached over TLS only", () => {
    const caddy = read("deploy/Caddyfile");
    expect(caddy).toContain('header Strict-Transport-Security "max-age=31536000; includeSubDomains"');
    expect(caddy.indexOf("Strict-Transport-Security")).toBeGreaterThan(caddy.indexOf("(common)"));
    expect(caddy.indexOf("Strict-Transport-Security")).toBeLessThan(caddy.indexOf("{$TURNOUT_DOMAIN}"));
    const sites = caddy.match(/^\S.*\{$/gm)?.filter((line) => line.includes("TURNOUT_DOMAIN")) ?? [];
    expect(sites).toHaveLength(2);
    expect(caddy.match(/import common/g)).toHaveLength(sites.length);
  });

  test("the app is behind the proxy: the server env files name the header the proxy writes", () => {
    expect(read("deploy/setup.sh")).toContain("TRUST_PROXY_HEADER=x-forwarded-for");
  });

  test("the firewall opens SSH, 80 and 443 and nothing else", () => {
    const rules = read("deploy/setup.sh").match(/^ufw allow .*$/gm) ?? [];
    expect(rules.map((rule) => rule.replace(/\s*>.*$/, ""))).toEqual(["ufw allow OpenSSH", "ufw allow 80/tcp", "ufw allow 443/tcp"]);
  });
});
