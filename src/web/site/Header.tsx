import { Brand } from "@web/ui/components/brand";
import { ViewSwitch } from "@web/ui/components/view-switch";
import { ThemeToggle } from "./ThemeToggle.js";

/**
 * The header of the listing and event pages: the brand, the List / Map switch when the page has a map counterpart (its hrefs
 * carry the shared filters), and the theme button. The same lockup, switch and button as the map's top row.
 */
export function Header({ view }: { view?: { current: "list" | "map"; list: string; map: string } }) {
  return (
    <header className="site-head">
      <a className="brand-link" href="/">
        <Brand />
      </a>
      {view ? <ViewSwitch {...view} /> : null}
      <span className="grow" />
      <ThemeToggle />
    </header>
  );
}
