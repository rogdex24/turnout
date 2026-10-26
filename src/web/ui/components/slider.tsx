/**
 * From the shadcn/ui registry, style base-nova (Base UI): https://ui.shadcn.com/r/styles/base-nova/slider.json
 * fetched 2026-10-11 (sha256 646bcd791341), registry served by shadcn@4.21.x. Adapted: imports point at @web/ui, icons are
 * lucide-react, classes are our DESIGN.md tokens, and the thumb is a ringed primary disc with the 44 px hit area.
 */
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@web/ui/lib/utils";

/** `thumbLabel` and `getThumbValueText` name the thumb, which is the element screen readers announce. */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabel,
  getThumbValueText,
  ...props
}: SliderPrimitive.Root.Props & { thumbLabel?: string; getThumbValueText?: (formatted: string, value: number, index: number) => string }) {
  const count = Array.isArray(value) ? value.length : Array.isArray(defaultValue) ? defaultValue.length : 1;
  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-hit w-full touch-none items-center select-none data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1 w-full grow overflow-hidden rounded-full bg-border select-none"
        >
          <SliderPrimitive.Indicator data-slot="slider-range" className="h-full bg-primary select-none" />
        </SliderPrimitive.Track>
        {Array.from({ length: count }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            // biome-ignore lint/suspicious/noArrayIndexKey: thumbs have no identity beyond their position in the value array
            key={index}
            aria-label={thumbLabel}
            getAriaValueText={getThumbValueText}
            className="relative block size-4 shrink-0 rounded-full border-2 border-primary bg-card select-none after:absolute after:-inset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
