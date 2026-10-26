/**
 * From the shadcn/ui registry, style base-nova (Base UI): https://ui.shadcn.com/r/styles/base-nova/combobox.json
 * fetched 2026-10-11 (sha256 d4b9231b0042), registry served by shadcn@4.21.x. Adapted: imports point at @web/ui, icons are
 * lucide-react, classes are our DESIGN.md tokens, and the parts the Filters popover does not use (chips, groups, the Button and InputGroup dependencies) are left out.
 */
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "@web/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";

const Combobox = ComboboxPrimitive.Root;

/** The text field with its chevron trigger. */
function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div className="relative flex items-center" data-slot="combobox-input-wrap">
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className={cn("h-control w-full rounded-sm border border-border bg-card px-3 pr-9 text-foreground outline-none", className)}
        {...props}
      />
      <ComboboxPrimitive.Trigger
        data-slot="combobox-trigger"
        aria-label="Show types"
        className="absolute right-1 grid size-hit cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground"
      >
        <ChevronDown className="i" size={16} strokeWidth={1.75} aria-hidden="true" />
      </ComboboxPrimitive.Trigger>
    </div>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  ...props
}: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="isolate z-[60]">
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content max-h-(--available-height) w-(--anchor-width) min-w-48 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-e3 ring-1 ring-border",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("max-h-64 overflow-y-auto overscroll-contain p-1 data-empty:p-0", className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-2 pr-8 pl-2 select-none data-highlighted:bg-accent data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2 grid size-4 place-items-center" />}>
        <Check className="i" size={16} strokeWidth={1.75} aria-hidden="true" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-muted-foreground group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

export { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList };
