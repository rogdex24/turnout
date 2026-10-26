import { useQueryStates } from "nuqs";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { LAYOUT } from "../layout.js";
import { areasIn, type Bounds, categoriesIn, counts, filterCollection, inBounds, rank, type Windows, withinKm } from "../model/filters.js";
import { plural } from "../model/format.js";
import { at, type MapState, normalizeSelection, selectedEvent, selectedVenue } from "../model/selection.js";
import { initialSession, nearby, reduce } from "../model/state.js";
import { filterParsers, filtersOf } from "../model/url.js";
import type { MapCollection } from "../types.js";
import { FilterBar } from "./FilterBar.js";
import type { CameraCommand, CameraRequest, Padding } from "./MapCanvas.js";
import { MapControls } from "./MapControls.js";
import { MapHeader } from "./MapHeader.js";
import { MapSlot } from "./MapSlot.js";
import { type FocusTarget, NavContext, type NavOptions } from "./nav.js";
import { EmptyArea, EmptyState, ResultsPanel } from "./ResultsPanel.js";
import { SkeletonRows } from "./Skeleton.js";
import { detentHeight } from "./sheetHeight.js";
import { VenueDetail } from "./VenueDetail.js";

/** What the server sends and the client hydrates from: the same props render the same tree. */
export interface MapBoot {
  data: MapCollection;
  windows: Windows;
  /** The request's query string (`?when=tonight`), the starting point of the URL state on both sides. */
  search: string;
  /** ?state= for screenshots: loading, empty, error or denied. */
  preview: string | null;
}

const sameBounds = (a: Bounds | null, b: Bounds) =>
  !!a && a.west === b.west && a.east === b.east && a.south === b.south && a.north === b.north;
/** The phone sheet is a Drawer in its own chunk, fetched only on phones. */
const MobileSheet = lazy(() => import("./MobileSheet.js"));
const PHONE = `(max-width: ${LAYOUT.phoneBelow - 1}px)`;
const NOTICE = "The map could not load. The list below has every event.";

/**
 * /map. One owner for the URL's filters, the session (location, sheet detent, folded sections) and the camera's
 * commands; the map, the pills and the list are derived from them. The server renders it with every match listed
 * (no viewport yet); the client hydrates the same tree, then the map reports a viewport and the list narrows to it.
 */
export function MapApp({ data: loaded, windows, preview }: Omit<MapBoot, "search">) {
  const data = useMemo<MapCollection>(() => (preview === "empty" ? { ...loaded, features: [] } : loaded), [loaded, preview]);
  // The URL is the state (D4): nuqs reads and writes it, so Back and Forward need no code of their own.
  const [raw, setRaw] = useQueryStates(filterParsers);
  const filters = useMemo(() => filtersOf(raw), [raw]);
  const matches = useMemo(() => filterCollection(data, filters, windows), [data, filters, windows]);
  // A card in the URL opens the sheet at half from the start.
  const [session, dispatch] = useReducer(reduce, matches, (m) =>
    initialSession(normalizeSelection(m, raw.venue, raw.event).kind === "none" ? "peek" : "half"),
  );
  const [viewport, setViewport] = useState<Bounds | null>(null);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  // False on the server and in the first client render, so hydration matches; phones then swap the card for the sheet.
  const [phone, setPhone] = useState(false);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(!!(filters.category || filters.area));
  /** The popover was opened because location was refused: it should land on Area ("Pick an area instead"). */
  const [focusArea, setFocusArea] = useState(false);
  const [geolocation, setGeolocation] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);
  const [announcement, setAnnouncement] = useState("");
  const panel = useRef<HTMLElement>(null);
  const pills = useRef<HTMLElement>(null);
  const seq = useRef(0);
  const focusTarget = useRef<FocusTarget | null>(null);

  const near = nearby(session.location);
  const visible = useMemo(() => withinKm(matches, near?.origin ?? null, near?.km ?? 0), [matches, near?.origin, near?.km]);
  // The URL's venue and event are resolved against what is shown, here and nowhere else; everything below carries the Selection.
  const selection = useMemo(() => normalizeSelection(visible, raw.venue, raw.event), [visible, raw.venue, raw.event]);
  const openVenue = selectedVenue(selection);
  const openEvent = selectedEvent(selection);
  const selected = openVenue === null ? null : (visible.find((f) => f.properties.venueId === openVenue) ?? null);
  const { events, venues } = counts(visible);
  const ranked = useMemo(
    () => rank(viewport ? inBounds(visible, viewport) : visible, near?.origin ?? null),
    [visible, viewport, near?.origin],
  );
  const viewEvents = counts(viewport ? inBounds(visible, viewport) : visible).events;

  const toast = useCallback((text: string) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { id, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
  }, []);
  const issue = useCallback((request: CameraRequest) => setCommand({ seq: ++seq.current, request }), []);

  /**
   * The one way to change the URL: every link, form and marker goes through it and pushes a history entry (typing in the
   * search box does not, it is a draft until submit). Nothing here moves the camera or the sheet; the effect below derives
   * those from the resulting filters, so Back and Forward get the same behavior as a click.
   */
  const go = useCallback(
    ({ filters: next, selection: chosen }: MapState, options: NavOptions = {}) => {
      if (options.focus) focusTarget.current = options.focus;
      void setRaw({ ...next, venue: selectedVenue(chosen), event: selectedEvent(chosen) }, { history: "push" });
    },
    [setRaw],
  );
  const nav = useMemo(() => ({ go }), [go]);

  const before = useRef({ filters, venue: openVenue, event: openEvent });
  useEffect(() => {
    const was = before.current;
    before.current = { filters, venue: openVenue, event: openEvent };
    if (openVenue !== was.venue) dispatch({ type: "sheet", detent: openVenue ? "half" : "peek" });
    // Opening a venue or an event flies to it, wherever the change came from; a changed search fits the results.
    // Closing a card or only changing the grouping leaves the camera alone.
    const opened = (openEvent && openEvent !== was.event) || (openVenue && openVenue !== was.venue);
    const searched = (["when", "category", "area", "free", "q"] as const).some((key) => filters[key] !== was.filters[key]);
    if (opened && openVenue) issue({ kind: "focus", venueId: openVenue });
    else if (searched) issue({ kind: "fit" });
  }, [filters, openVenue, openEvent, issue]);

  useEffect(() => {
    const query = matchMedia(PHONE);
    const on = () => setPhone(query.matches);
    on();
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  useEffect(() => setGeolocation("geolocation" in navigator), []);
  // The ?state=denied preview takes the same path as a real refusal, once the filter row has rendered (the Filters pill is added after hydration).
  const showDenial = useEffectEvent(() => openFiltersForDenial());
  useEffect(() => {
    if (preview !== "denied") return;
    toast("Location is off. Pick an area instead");
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => showDenial()));
    return () => cancelAnimationFrame(frame);
  }, [preview, toast]);

  // Without a working map the page is a plain document again: the list stays, with one line saying why.
  // The viewport belonged to the map that is gone: forget it, so the list is every current match (heading "N events"), not the
  // part of them that was in view when the map died.
  useEffect(() => {
    if (status === "failed") {
      document.documentElement.classList.remove("js-map");
      setViewport(null);
    }
  }, [status]);

  /** The Filters pill may be scrolled out of the row on a phone: bring it into view first, so the popover has an anchor on screen. */
  const openFiltersForDenial = () => {
    pills.current?.querySelector<HTMLElement>(".filters")?.scrollIntoView({ inline: "center", block: "nearest" });
    setFocusArea(true);
    setFiltersOpen(true);
  };

  const askLocation = () => {
    if (session.location.kind === "on") {
      dispatch({ type: "locate-off" });
      return;
    }
    if (session.location.kind === "requesting") return;
    dispatch({ type: "locate-start" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        dispatch({ type: "locate-found", origin: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
        issue({ kind: "ring" });
      },
      () => {
        dispatch({ type: "locate-denied" });
        toast("Location is off. Pick an area instead");
        openFiltersForDenial();
      },
      { timeout: 8000 },
    );
  };
  // The slider is the last pill: on phones scroll the row to its end so it is in view.
  useEffect(() => {
    if (session.location.kind === "on" && pills.current) pills.current.scrollLeft = pills.current.scrollWidth;
  }, [session.location.kind]);

  // Focus follows an activated row or link into the tree it opened (DESIGN.md, Focus). The request stays until the target
  // exists (the URL update and the render it causes can land in separate commits) and is checked once more a frame later,
  // in case the list was rebuilt around the focused element.
  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const find = () => {
      const root = panel.current;
      return "event" in target
        ? root?.querySelector<HTMLElement>(`[data-event="${CSS.escape(target.event)}"]`)
        : root?.querySelector<HTMLElement>(`[data-venue="${CSS.escape(target.venue)}"]`);
    };
    const el = find();
    if (!el) return;
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const again = find();
      if (again && document.activeElement !== again) again.focus({ preventScroll: true });
      if (focusTarget.current === target) focusTarget.current = null;
    });
  });

  // Switching the grouping starts the list at the top; an opened event scrolls into view once, not on every redraw.
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [filters.group]);
  useEffect(() => {
    if (openEvent)
      panel.current
        ?.querySelector(".row.open")
        ?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [openEvent]);
  // An empty result opens the sheet so Clear filters is visible.
  useEffect(() => {
    if (events === 0 && status === "ready") dispatch({ type: "sheet", detent: "half" });
  }, [events, status]);

  // The one live region: it announces the settled viewport count, after the map stops moving or a filter changes.
  useEffect(() => {
    if (!viewport) return;
    const timer = setTimeout(() => setAnnouncement(`${plural(viewEvents, "event")} in view`), 400);
    return () => clearTimeout(timer);
  }, [viewport, viewEvents]);

  // The part of the map the card (wide) or the sheet (phone) covers, read when the camera moves. The sheet's height is the one its
  // detent names, which is where it settles, not whatever a drag has it at.
  const sheetNow = useRef(session.sheet);
  sheetNow.current = session.sheet;
  const padding = useCallback((): Padding => {
    if (matchMedia(PHONE).matches)
      // At full the list keeps the results it had at half: the full sheet would cover all but a strip of the map, and "in view" of
      // that strip is not what a reader expanding the sheet to read it wants. Camera moves and the viewport use half there too.
      return { top: 0, left: 0, right: 0, bottom: detentHeight(sheetNow.current === "full" ? "half" : sheetNow.current, innerHeight) };
    return { top: 0, left: 0, right: (panel.current?.offsetWidth ?? 0) + LAYOUT.cardEdge + LAYOUT.cameraGap, bottom: 0 };
  }, []);
  // After the sheet has settled at a new detent the unobscured part of the map is different: report it again.
  useEffect(() => {
    if (!phone) return;
    const timer = setTimeout(() => issue({ kind: "refresh" }), LAYOUT.motion.base + 50);
    return () => clearTimeout(timer);
  }, [session.sheet, phone, issue]);

  const onSelect = useCallback(
    (venueId: string | null) => go(at(filters, venueId ? { kind: "venue", venueId } : undefined)),
    [go, filters],
  );
  const onViewport = useCallback((b: Bounds) => setViewport((prev) => (sameBounds(prev, b) ? prev : b)), []);
  const onStatus = useCallback((s: "ready" | "failed") => setStatus(s), []);
  const onBearing = useCallback((degrees: number) => setBearing(degrees), []);
  const onRadius = useCallback((km: number) => dispatch({ type: "radius", km }), []);
  const onRadiusCommit = useCallback(() => issue({ kind: "ring" }), [issue]);
  const onSection = useCallback((key: string, open: boolean) => dispatch({ type: "section", key, open }), []);

  const loading = preview === "loading";
  const body: ReactNode = loading ? (
    <SkeletonRows />
  ) : selected ? (
    <VenueDetail feature={selected} filters={filters} selection={selection} organisers={data.organisers} />
  ) : ranked.length ? (
    <ResultsPanel
      ranked={ranked}
      filters={filters}
      selection={selection}
      organisers={data.organisers}
      collapsed={session.collapsed}
      inView={!!viewport}
      unplaced={data.excludedNoLocation}
      onSection={onSection}
    />
  ) : events > 0 ? (
    <EmptyArea elsewhere={events} onShowAll={() => issue({ kind: "fit" })} />
  ) : (
    <EmptyState />
  );
  /** After a failure: the page is a map page again and the map is asked for once more. */
  const retry = () => {
    document.documentElement.classList.add("js-map");
    setStatus("loading");
    setAttempt((n) => n + 1);
  };
  const failed = preview === "error" || status === "failed";
  return (
    <NavContext.Provider value={nav}>
      <div className="map-app" id="app" data-snap={session.sheet} ref={setFrame}>
        <MapHeader filters={filters} />
        {failed ? (
          <p className="notice" role="status">
            {NOTICE}
            {status === "failed" ? (
              <>
                {" "}
                <button type="button" className="link" onClick={retry}>
                  Try again
                </button>
              </>
            ) : null}
          </p>
        ) : null}
        <nav className="pills" id="pills" aria-label="Map filters" ref={pills}>
          <FilterBar
            filters={filters}
            categories={categoriesIn(data)}
            areas={areasIn(data)}
            near={{ km: near?.km ?? null }}
            filtersOpen={filtersOpen}
            focusArea={focusArea}
            onFiltersOpen={(open) => {
              setFiltersOpen(open);
              if (!open) setFocusArea(false);
            }}
            onRadius={onRadius}
            onRadiusCommit={onRadiusCommit}
          />
        </nav>
        <MapSlot
          enabled={!loading && !failed}
          attempt={attempt}
          features={visible}
          selectedVenue={selected?.properties.venueId ?? null}
          location={session.location}
          padding={padding}
          command={command}
          onSelect={onSelect}
          onViewport={onViewport}
          onStatus={onStatus}
          onBearing={onBearing}
        />
        <MapControls
          ready={status === "ready" && !loading && !failed}
          geolocation={geolocation}
          requesting={session.location.kind === "requesting"}
          nearOn={session.location.kind === "on"}
          rotated={Math.abs(bearing) > 0.5}
          onZoom={(by) => issue({ kind: "zoom", by })}
          onNorth={() => issue({ kind: "north" })}
          onNear={askLocation}
        />
        <div className="count" id="count">
          {`${plural(events, "event")} · ${plural(venues, "venue")}`}
          {data.excludedNoLocation ? (
            <>
              {" "}
              <span className="muted" title="Events whose venue has no known location are not on the map.">
                +{data.excludedNoLocation} unplaced
              </span>
            </>
          ) : null}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        {phone ? (
          <Suspense
            fallback={
              <aside className="panel" id="panel" aria-label="Events" ref={panel}>
                {body}
              </aside>
            }
          >
            <MobileSheet
              detent={session.sheet}
              onDetent={(detent) => dispatch({ type: "sheet", detent })}
              container={frame}
              scrollRef={panel}
            >
              {body}
            </MobileSheet>
          </Suspense>
        ) : (
          <aside className="panel" id="panel" aria-label="Events" ref={panel}>
            {body}
          </aside>
        )}
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="status">
            {t.text}
          </div>
        ))}
      </div>
      <p className="muted attribution">
        Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by{" "}
        <a href="https://openfreemap.org">OpenFreeMap</a>.
      </p>
    </NavContext.Provider>
  );
}

export { LAYOUT };
