/**
 * The theme preference protocol, shared by the public site and the admin.
 *
 * The preference is "auto" (follow the OS), "light" or "dark", kept in
 * localStorage under `theme`. One function reads it, optionally changes it, and
 * writes the result to the page in the shape each side wants:
 *  - "attribute": `data-theme="light|dark"` on <html>, removed for auto (the public CSS keys off it).
 *  - "class": `.dark` on <html> (Tailwind and shadcn in the admin), with `color-scheme` set inline.
 *
 * `themeProtocol` refers to nothing outside itself, so the public site can embed
 * its source in an inline <script> (`bootScript`) that runs before first paint.
 */
// Only the browser calls these. Declared here, not from the DOM lib, so this file adds no DOM types to
// the server programs that import it (module-scoped, so it does not clash where the DOM lib is on).
declare const document: {
  documentElement: {
    dataset: Record<string, string | undefined>;
    classList: { toggle(name: string, force: boolean): void };
    style: { colorScheme: string };
  };
};
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
declare const matchMedia: (query: string) => { matches: boolean };

export type ThemePreference = "auto" | "light" | "dark";
export type ThemeOutput = "attribute" | "class";

export const THEME_ORDER: readonly ThemePreference[] = ["auto", "light", "dark"];

/** Reads the stored preference, stores `set` first when given, applies it, and returns it. */
export function themeProtocol(output: ThemeOutput, set?: ThemePreference): ThemePreference {
  const root = document.documentElement;
  let preference: ThemePreference = set ?? "auto";
  try {
    if (set === "auto") localStorage.removeItem("theme");
    else if (set) localStorage.setItem("theme", set);
    else {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") preference = stored;
    }
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  if (output === "attribute") {
    if (preference === "auto") delete root.dataset.theme;
    else root.dataset.theme = preference;
  } else {
    const dark = preference === "dark" || (preference === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }
  return preference;
}

export const nextPreference = (current: ThemePreference): ThemePreference =>
  THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length]!;

/** An inline <script> body that applies the stored preference as soon as it is parsed. */
export const bootScript = (output: ThemeOutput): string => `(${themeProtocol.toString()})(${JSON.stringify(output)})`;
