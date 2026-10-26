/**
 * From the shadcn/ui registry, style base-nova (Base UI): https://ui.shadcn.com/r/styles/base-nova/drawer.json
 * fetched 2026-10-11 (sha256 fc81c0adadef), registry served by shadcn@4.21.x. Adapted: imports point at @web/ui; only the bottom
 * sheet is kept (no modal overlay, no side or nested drawers, no stacking), because /map's sheet is a non-modal bottom sheet
 * with snap points; and the visual classes live in the page CSS (`.drawer-popup`, DESIGN.md Sheet) instead of the stock
 * Tailwind strings. The structure is the registry's: Root, Portal, Viewport, Popup, Content.
 */
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@web/ui/lib/utils";

/** A bottom sheet that never traps focus or dims the page, and ignores presses outside it, so the map under it keeps working. */
function Drawer({ snapPoints, ...props }: Omit<DrawerPrimitive.Root.Props, "modal" | "swipeDirection" | "disablePointerDismissal">) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      modal={false}
      swipeDirection="down"
      disablePointerDismissal
      snapPoints={snapPoints}
      {...props}
    />
  );
}

/** `container` puts the sheet inside the app frame instead of the end of <body>. */
function DrawerContent({ className, children, container, ...props }: DrawerPrimitive.Popup.Props & { container?: HTMLElement | null }) {
  return (
    <DrawerPrimitive.Portal data-slot="drawer-portal" container={container}>
      <DrawerPrimitive.Viewport data-slot="drawer-viewport" className="drawer-viewport">
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-snap-points=""
          initialFocus={false}
          className={cn("drawer-popup", className)}
          {...props}
        >
          <DrawerPrimitive.Content data-slot="drawer-content" className="drawer-content">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn(className)} {...props} />;
}

export { Drawer, DrawerContent, DrawerTitle };
