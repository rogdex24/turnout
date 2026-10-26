/**
 * DESIGN.md as CSS. Colors, spacing and radii come from
 * `design.md export --format css-vars` (the pinned @google/design.md CLI);
 * typography and component sizes are read from the same file's front matter;
 * prose-only numbers come from layout.ts. Nothing here is hand-copied from the
 * design file, so editing DESIGN.md and restarting is the whole workflow.
 *
 * Roles (--ink, --surface, ...) point at the light token; one dark block
 * repoints every role that has a `-dark` twin, so dark mode is defined once.
 */
import { DESIGN_URL, type DesignFront, readDesignFront } from "../../utils/design.js";
import { INTER_FONT_FACE } from "../fonts.js";
import { LAYOUT } from "./layout.js";

const CLI_URL = new URL("../../../node_modules/@google/design.md/dist/index.js", import.meta.url);

type Front = DesignFront;

export const readFrontMatter = readDesignFront;

function exportCssVars(): string[] {
  const run = Bun.spawnSync([process.execPath, CLI_URL.pathname, "export", "--format", "css-vars", DESIGN_URL.pathname]);
  if (run.exitCode !== 0) throw new Error(`design.md export failed: ${run.stderr.toString()}`);
  return run.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("--"));
}

/** A `--color-X` var with a `--color-X-dark` twin becomes a role. A role is every color with a -dark twin. */
function roles(vars: string[]): { light: string[]; dark: string[] } {
  const names = vars.filter((line) => line.startsWith("--color-")).map((line) => line.slice(8, line.indexOf(":")));
  const set = new Set(names);
  const light: string[] = [];
  const dark: string[] = [];
  for (const name of names) {
    if (name.endsWith("-dark")) continue;
    light.push(`--${name}: var(--color-${name});`);
    if (set.has(`${name}-dark`)) dark.push(`--${name}: var(--color-${name}-dark);`);
  }
  return { light, dark };
}

function typographyVars(front: Front): string[] {
  const out: string[] = [];
  for (const [name, t] of Object.entries(front.typography)) {
    out.push(`--font-${name}: ${t.fontSize}/${t.lineHeight} ${t.fontFamily};`);
    out.push(`--weight-${name}: ${t.fontWeight};`);
    out.push(`--size-${name}: ${t.fontSize};`, `--leading-${name}: ${t.lineHeight};`);
  }
  return out;
}

/** Every height, size, width and padding a component declares, as --<component>-<prop>. */
function componentVars(front: Front): string[] {
  const out: string[] = [];
  for (const [name, props] of Object.entries(front.components)) {
    for (const prop of ["height", "size", "width", "padding"]) {
      if (props[prop] !== undefined) out.push(`--${name}-${prop}: ${props[prop]};`);
    }
  }
  return out;
}

/**
 * The standard shadcn variables, from the roles above (DESIGN.md, Colors). They point at roles,
 * so the one dark block repoints them too. `--muted`, `--secondary` and `--accent` are the
 * hover tint, the same mix the pills use.
 */
function shadcnVars(): string[] {
  const tint = "color-mix(in srgb, var(--ink) 4%, var(--surface))";
  return [
    "--background: var(--bg);",
    "--foreground: var(--ink);",
    "--card: var(--surface);",
    "--card-foreground: var(--ink);",
    "--popover: var(--surface);",
    "--popover-foreground: var(--ink);",
    "--primary-foreground: var(--on-primary);",
    `--secondary: ${tint};`,
    "--secondary-foreground: var(--ink);",
    `--muted: ${tint};`,
    `--accent: ${tint};`,
    "--accent-foreground: var(--ink);",
    "--destructive: var(--danger);",
    "--destructive-foreground: var(--on-danger);",
    "--border: var(--line);",
    "--input: var(--line);",
    "--ring: var(--primary);",
    "--radius: var(--rounded-card);",
  ];
}

function layoutVars(front: Front): string[] {
  const L = LAYOUT;
  const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
  const shadows = (shadow: (pct: number) => string, ink: (pct: number) => string) => [
    `--e1: 0 1px 2px ${shadow(L.elevation.e1)};`,
    `--e2: 0 1px 2px ${shadow(L.elevation.e2Contact)}, 0 4px 12px ${shadow(L.elevation.e2Ambient)};`,
    `--e3: 0 1px 3px ${ink(L.elevation.e3)}, 0 8px 24px ${ink(L.elevation.e3)};`,
    `--e-chip: 0 1px 3px ${shadow(L.elevation.chip)};`,
  ];
  return [
    `--font-family: ${front.typography.body!.fontFamily};`,
    `--frame-inset: ${L.frameInset}px;`,
    `--card-edge: ${L.cardEdge}px;`,
    `--sheet-peek: ${L.sheetPeek}px;`,
    `--sheet-half: ${L.sheetHalfDvh}dvh;`,
    `--sheet-full: calc(100dvh - ${L.sheetFullInset}px);`,
    "--hit: var(--hit-area-size);",
    `--tile-glyph: ${L.tileGlyph}px;`,
    `--badge-min: ${L.badgeMinWidth}px;`,
    `--badge-pad: ${L.badgePadX}px;`,
    `--badge-offset: ${L.badgeOffset}px;`,
    `--label-max: ${L.labelMax}px;`,
    `--label-gap: ${L.labelGap}px;`,
    `--stack-offset: ${L.stackOffset}px;`,
    `--tint-mix: ${L.tileTintPct.light}%;`,
    "--icon-toward: var(--ink);",
    `--icon-toward-pct: ${L.iconTowardPct.light}%;`,
    `--ring-selected: ${L.selectedRing}px;`,
    `--ring-focus: ${L.focusRing}px;`,
    `--ring-offset: ${L.focusOffset}px;`,
    "--attrib-icon: none;",
    `--blur: ${L.glassBlur}px;`,
    `--search-icon: ${L.searchIcon}px;`,
    `--search-inset: ${L.searchIconInset}px;`,
    `--poster-blur: ${L.posterBlur}px;`,
    `--poster-dim: ${L.posterDim}%;`,
    `--motion-fast: ${L.motion.fast}ms;`,
    `--motion-base: ${L.motion.base}ms;`,
    `--motion-camera: ${L.motion.camera}ms;`,
    `--ease-out: ${L.motion.ease};`,
    ...L.placeholderSteps.map((pct, i) => `--ph-${i + 1}: color-mix(in srgb, var(--ink) ${pct}%, var(--surface));`),
    ...shadows(
      (n) => mix("--color-shadow", n),
      (n) => mix("--color-ink", n),
    ),
  ];
}

function darkOverrides(light: string[]): string[] {
  const L = LAYOUT;
  // Dark mode mixes the shadow color at one alpha for every layer of every level.
  const m = `color-mix(in srgb, var(--color-shadow) ${L.elevation.darkAlpha}%, transparent)`;
  return [
    ...light,
    `--tint-mix: ${L.tileTintPct.dark}%;`,
    "--icon-toward: var(--color-icon-lift);",
    `--icon-toward-pct: ${L.iconTowardPct.dark}%;`,
    "--attrib-icon: invert(1);",
    `--e1: 0 1px 2px ${m};`,
    `--e2: 0 1px 2px ${m}, 0 4px 12px ${m};`,
    `--e3: 0 1px 3px ${m}, 0 8px 24px ${m};`,
    `--e-chip: 0 1px 3px ${m};`,
  ];
}

let cached: string | null = null;

/** The generated block: :root tokens plus the one dark-mode mapping. Built once per process. */
export function designTokensCss(): string {
  if (cached) return cached;
  const front = readFrontMatter();
  const vars = exportCssVars();
  const { light, dark } = roles(vars);
  const body = (lines: string[]) => lines.map((line) => `  ${line}`).join("\n");
  const darkBlock = body(darkOverrides(dark));
  cached = `/* generated from DESIGN.md: do not edit */
${INTER_FONT_FACE}
:root {
${body([...vars, ...light, ...typographyVars(front), ...componentVars(front), ...layoutVars(front), ...shadcnVars()])}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${darkBlock}
  }
}
:root[data-theme="dark"] {
${darkBlock}
}
`;
  return cached;
}
