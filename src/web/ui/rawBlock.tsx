/**
 * The one place the web code puts a string into the page as markup (R3 in docs/plans/map-react-migration.md). It is for fixed
 * blocks our own server code produces: the theme boot script, the theme toggle's script, the page's generated token CSS and an
 * event's JSON-LD (escaped by its caller). Nothing a reader typed and nothing interactive goes through it, and no DOM is ever
 * built from strings in the browser. `test/mapSource.test.ts` fails on any other use of the React escape hatch, or of the DOM's
 * string-to-markup setters, anywhere under src/web.
 */
export function RawBlock({ as, html, type }: { as: "script" | "style"; html: string; type?: string }) {
  return as === "script" ? (
    <script type={type} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <style dangerouslySetInnerHTML={{ __html: html }} />
  );
}
