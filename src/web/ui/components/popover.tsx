/**
 * From the shadcn/ui registry, style base-nova (Base UI): https://ui.shadcn.com/r/styles/base-nova/popover.json
 * fetched 2026-10-11 (sha256 ba5fe84f353f), registry served by shadcn@4.21.x. Adapted: imports point at @web/ui, icons are
 * lucide-react, classes are our DESIGN.md tokens, and the animation classes (tw-animate-css is not loaded) are replaced by a base-duration fade and scale from DESIGN.md, Elevation & Depth.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@web/ui/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/** `anchor` positions it against an element that is not a Popover.Trigger (the Filters pill lives in the main bundle). */
function PopoverContent({
  className,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 8,
  anchor,
  ...props
}: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "anchor">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex origin-(--transform-origin) flex-col gap-3 rounded-lg bg-popover p-4 text-popover-foreground shadow-e3 ring-1 ring-border outline-hidden transition-[opacity,transform] duration-(--motion-base) ease-(--ease-out) data-ending-style:scale-[.96] data-ending-style:opacity-0 data-starting-style:scale-[.96] data-starting-style:opacity-0 motion-reduce:transition-none",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
