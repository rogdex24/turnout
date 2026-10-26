import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@web/ui/components/combobox";
import { Popover, PopoverContent } from "@web/ui/components/popover";
import { type FormEvent, type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";
import { DEFAULT_FILTERS, type MapFilters } from "../model/filters.js";
import { humanize } from "../model/format.js";
import { at } from "../model/selection.js";
import { CategoryIcon } from "./CategoryIcon.js";
import { NavLink } from "./nav.js";

interface CategoryOption {
  value: string;
}

/**
 * The Filters popover: Type as a Combobox with icon labels, Area as a native select. It is its own chunk: the filter row
 * loads it on the first open, so most visits never download Popover or Combobox. The pill that opens it lives in the main
 * bundle and is the popover's anchor. Escape and a click outside close it and focus returns to the pill.
 */
export default function FiltersPopover({
  filters,
  categories,
  areas,
  open,
  focusArea,
  onOpenChange,
  anchor,
  onApply,
}: {
  filters: MapFilters;
  categories: string[];
  areas: string[];
  open: boolean;
  focusArea?: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLElement | null>;
  onApply: (next: MapFilters) => void;
}) {
  const options: CategoryOption[] = categories.map((value) => ({ value }));
  const [category, setCategory] = useState<CategoryOption | null>(options.find((o) => o.value === filters.category) ?? null);
  const [area, setArea] = useState(filters.area ?? "");
  const areaRef = useRef<HTMLSelectElement>(null);
  // The fields are a draft of the committed filters. When the committed ones move (Back, Forward, Clear all, a link), the draft
  // starts over from them; while they do not move (a pan, closing the popover), an unsubmitted edit stays.
  const resetDraft = useEffectEvent(() => {
    setCategory(categories.includes(filters.category ?? "") ? { value: filters.category! } : null);
    setArea(filters.area ?? "");
  });
  useEffect(() => {
    resetDraft();
  }, [filters.category, filters.area]);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    onApply({ ...filters, category: category?.value ?? null, area: area || null });
    onOpenChange(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        // A press on the Filters pill is an outside press too; the pill's own click toggles, so do not close twice.
        if (
          !next &&
          details.reason === "outside-press" &&
          details.event.target instanceof Node &&
          anchor.current?.contains(details.event.target)
        )
          return;
        onOpenChange(next);
        // Pressing on the map moves focus to the map canvas as the press finishes; once it has, give focus back to the pill
        // unless the press landed on something else the reader can use.
        if (!next && details.reason !== "escape-key") {
          setTimeout(() => {
            const now = document.activeElement;
            if (!now || now === document.body || now instanceof HTMLCanvasElement) anchor.current?.focus();
          }, 80);
        }
      }}
    >
      <PopoverContent
        anchor={anchor}
        className="filters-popover"
        finalFocus={anchor}
        initialFocus={focusArea ? areaRef : true}
        aria-label="Filters"
      >
        <form onSubmit={apply} className="grid gap-3">
          <label className="grid gap-1 text-[length:var(--size-meta)]">
            Type
            <Combobox
              items={options}
              value={category}
              onValueChange={(value: CategoryOption | null) => setCategory(value)}
              itemToStringLabel={(o: CategoryOption) => humanize(o.value)}
            >
              <ComboboxInput placeholder="All types" />
              <ComboboxContent>
                <ComboboxEmpty>No such type</ComboboxEmpty>
                <ComboboxList>
                  {(o: CategoryOption) => (
                    <ComboboxItem key={o.value} value={o}>
                      <CategoryIcon category={o.value} />
                      {humanize(o.value)}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </label>
          <label className="grid gap-1 text-[length:var(--size-meta)]">
            Area
            <select ref={areaRef} name="area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button">
            Apply
          </button>
          <NavLink className="link" to={at({ ...DEFAULT_FILTERS, group: filters.group })} onClick={() => onOpenChange(false)}>
            Clear all
          </NavLink>
        </form>
      </PopoverContent>
    </Popover>
  );
}
