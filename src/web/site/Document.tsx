import { chromeCss } from "@web/ui/chrome";
import { RawBlock } from "@web/ui/rawBlock";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_NAME, TAKEDOWN_EMAIL } from "../config.js";
import { INTER_URL } from "../fonts.js";
import { designTokensCss } from "../map/tokens.js";
import { THEME_BOOT_JS, THEME_CSS, THEME_TOGGLE_JS } from "../theme.js";
import { siteCss } from "./styles.js";

/**
 * A server-rendered page: the shared tokens and Inter, the chrome and the page's own arrangement, the theme boot in the head
 * (so a stored choice never flashes) and the theme button's script at the end. No other script, no bundle. The inline blobs
 * are fixed strings from our own code (and the JSON-LD with its `<` escaped), so they go in as raw HTML.
 */
function Document({ title, jsonLd, children }: { title: string; jsonLd?: object; children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · ${SITE_NAME}`}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <RawBlock as="script" html={THEME_BOOT_JS} />
        {jsonLd ? <RawBlock as="script" type="application/ld+json" html={JSON.stringify(jsonLd).replace(/</g, "\\u003c")} /> : null}
        <link rel="preload" href={INTER_URL} as="font" type="font/woff2" crossOrigin="" />
        <RawBlock as="style" html={`${designTokensCss()}\n${chromeCss()}\n${THEME_CSS}\n${siteCss()}`} />
      </head>
      <body className="site">
        <div className="page">{children}</div>
        <footer className="page foot">
          Takedown: <a href={`mailto:${TAKEDOWN_EMAIL}`}>{TAKEDOWN_EMAIL}</a>
        </footer>
        <RawBlock as="script" html={THEME_TOGGLE_JS} />
      </body>
    </html>
  );
}

/** The whole document as a string: `<!doctype html>` and the page. */
export function renderDocument(props: { title: string; jsonLd?: object; children: ReactNode }): string {
  return `<!doctype html>${renderToStaticMarkup(<Document {...props} />)}`;
}
