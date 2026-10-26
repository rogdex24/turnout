/** Reads DESIGN.md, the one source of every color, size and type style. Server side only (node:fs). */
import fs from "node:fs";

export const DESIGN_URL = new URL("../../DESIGN.md", import.meta.url);

export interface DesignFront {
  colors: Record<string, string>;
  typography: Record<string, { fontFamily: string; fontSize: string; fontWeight: number; lineHeight: string; fontFeature?: string }>;
  components: Record<string, Record<string, string | number>>;
}

let cached: DesignFront | null = null;

export function readDesignFront(): DesignFront {
  if (cached) return cached;
  const match = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(DESIGN_URL, "utf8"));
  if (!match) throw new Error("DESIGN.md has no front matter");
  cached = Bun.YAML.parse(match[1]!) as DesignFront;
  return cached;
}
