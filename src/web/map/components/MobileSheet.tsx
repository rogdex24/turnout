import { Drawer, DrawerContent, DrawerTitle } from "@web/ui/components/drawer";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useMemo, useState } from "react";
import { LAYOUT } from "../layout.js";
import { DETENTS, type Detent } from "../model/state.js";
import { Icon } from "./Icon.js";
import { detentHeight } from "./sheetHeight.js";

const step = (from: Detent, by: number): Detent => DETENTS[Math.min(Math.max(DETENTS.indexOf(from) + by, 0), DETENTS.length - 1)]!;

/**
 * The phone sheet: a shadcn Drawer (Base UI), non-modal, with three snap points. A swipe moves between them, a tap on the
 * handle cycles them, and the Expand and Collapse buttons do the same for keyboards. It cannot be dismissed (it is the list),
 * and the map above it keeps taking pointer input. Its own chunk, fetched only on phones.
 */
export default function MobileSheet({
  detent,
  onDetent,
  container,
  scrollRef,
  children,
}: {
  detent: Detent;
  onDetent: (next: Detent) => void;
  container: HTMLElement | null;
  scrollRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [height, setHeight] = useState(() => innerHeight);
  useEffect(() => {
    const on = () => setHeight(innerHeight);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  // One snap point per detent, as a visible height in px, so a snap point maps back to its detent by position.
  const points = useMemo(() => DETENTS.map((d) => `${Math.round(detentHeight(d, height))}px`), [height]);

  return (
    <Drawer
      open
      // The list cannot go away: a swipe past the lowest detent springs back (the drawer is controlled and always open).
      onOpenChange={() => {}}
      snapPoints={points}
      snapPoint={points[DETENTS.indexOf(detent)]!}
      onSnapPointChange={(point) => {
        const at = points.indexOf(String(point));
        if (at >= 0) onDetent(DETENTS[at]!);
      }}
    >
      <DrawerContent container={container} id="panel" aria-label="Events">
        <div className="sheet-controls">
          <button
            type="button"
            className="sheet-handle"
            data-handle
            aria-label="Resize the list"
            aria-expanded={detent !== "peek"}
            aria-describedby="detent-state"
            onClick={() => onDetent(DETENTS[(DETENTS.indexOf(detent) + 1) % DETENTS.length]!)}
          />
          <div className="detents">
            <button
              type="button"
              aria-label="Collapse"
              aria-controls="panel"
              disabled={detent === "peek"}
              onClick={() => onDetent(step(detent, -1))}
            >
              <Icon as={ChevronDown} />
            </button>
            <button
              type="button"
              aria-label="Expand"
              aria-controls="panel"
              disabled={detent === "full"}
              onClick={() => onDetent(step(detent, 1))}
            >
              <Icon as={ChevronUp} />
            </button>
          </div>
        </div>
        <DrawerTitle className="sr-only">Events</DrawerTitle>
        <span id="detent-state" className="sr-only">{`The list is at ${detent} height`}</span>
        <div
          className="panel-scroll"
          ref={scrollRef as RefObject<HTMLDivElement>}
          // How much of the sheet (as tall as full) is below the screen at this detent; the scroll area pads its end by it.
          style={
            {
              "--sheet-hidden": `${Math.max(Math.round(detentHeight("full", height) - detentHeight(detent, height)), 0)}px`,
            } as React.CSSProperties
          }
          // Tab can land on a row the peek has pushed off screen: open the sheet to half so focus is never somewhere unseen.
          onFocusCapture={(event) => {
            const target = event.target as HTMLElement;
            if (detent !== "peek" || target.getBoundingClientRect().top < innerHeight - LAYOUT.cardEdge) return; // its top is on screen: the peek shows it
            onDetent("half");
            // Once the sheet has settled (its transform has finished moving), bring the focused row into the part that is on screen.
            // The scroll area is as tall as the full sheet and only its top part shows at half, so "in view" for the scroller is not
            // "on screen": scroll by how far the row is below the bottom of the window.
            const popup = target.closest<HTMLElement>('[data-slot="drawer-popup"]');
            // The list narrows to the new viewport once the sheet moves, so the row may have been drawn again: find it by its id.
            const id = target.getAttribute("data-event");
            const reveal = () => {
              const scroller = scrollRef.current;
              const row = id ? scroller?.querySelector<HTMLElement>(`[data-event="${CSS.escape(id)}"]`) : target;
              if (!scroller || !row) return;
              const over = row.getBoundingClientRect().bottom - innerHeight;
              if (over > 0) scroller.scrollTop += over + LAYOUT.cardEdge;
            };
            popup?.addEventListener("transitionend", function done(e) {
              if (e.target !== popup || e.propertyName !== "transform") return;
              popup.removeEventListener("transitionend", done);
              reveal();
            });
            setTimeout(reveal, LAYOUT.motion.base * 3); // reduced motion, or no transition to wait for
          }}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
