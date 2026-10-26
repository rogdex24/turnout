import { type AnchorHTMLAttributes, createContext, type MouseEvent, useContext } from "react";
import type { MapState } from "../model/selection.js";
import { href } from "../model/url.js";

/** What to focus after a navigation: an event's row, or the first row or header of a venue. */
export type FocusTarget = { event: string } | { venue: string };

export interface NavOptions {
  focus?: FocusTarget;
}

export interface Nav {
  go(next: MapState, options?: NavOptions): void;
}

export const NavContext = createContext<Nav>({ go: () => {} });

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: MapState; focus?: FocusTarget };

/** A real link (works without JavaScript) that the client upgrades to a state change. Modified clicks keep the browser's behavior. */
export function NavLink({ to, focus, onClick, ...rest }: LinkProps) {
  const nav = useContext(NavContext);
  return (
    <a
      {...rest}
      href={href(to)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        nav.go(to, { focus });
      }}
    />
  );
}
