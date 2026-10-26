import { type AnchorHTMLAttributes, useSyncExternalStore } from "react";

const CHANGE = "app:navigate";

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(CHANGE, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(CHANGE, listener);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

/** The current path and query. Re-renders on back/forward and on navigate(). */
export function useLocation(): { path: string; search: URLSearchParams } {
  const href = useSyncExternalStore(subscribe, snapshot);
  const [path = "", query = ""] = href.split("?");
  return { path, search: new URLSearchParams(query) };
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === snapshot()) return;
  window.history[options.replace ? "replaceState" : "pushState"](null, "", to);
  window.dispatchEvent(new Event(CHANGE));
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
