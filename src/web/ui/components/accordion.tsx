/**
 * From the shadcn/ui registry, style base-nova (Base UI): https://ui.shadcn.com/r/styles/base-nova/accordion.json
 * fetched 2026-10-11 (sha256 01509cb2a917), registry served by shadcn@4.21.x. Adapted: imports point at
 * @web/ui, the icon placeholder is lucide-react, and the classes are our DESIGN.md tokens (the
 * stock ones assumed shadcn's default theme). The rest is the registry source.
 */
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "@web/ui/lib/utils";
import { ChevronDown } from "lucide-react";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn("flex w-full flex-col", className)} {...props} />;
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn(className)} {...props} />;
}

/** The trigger is the whole header line; the chevron turns with `aria-expanded` (see the panel list in DESIGN.md). */
/** `plainHeader` renders the header as a div: used where the heading is somewhere else on the row (a venue name that is a link). */
function AccordionTrigger({ className, children, plainHeader, ...props }: AccordionPrimitive.Trigger.Props & { plainHeader?: boolean }) {
  return (
    <AccordionPrimitive.Header className="flex" render={plainHeader ? <div /> : undefined}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn("flex flex-1 items-center justify-between text-left", className)}
        {...props}
      >
        {children}
        <ChevronDown
          data-slot="accordion-trigger-icon"
          className="i pointer-events-none shrink-0"
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel data-slot="accordion-content" className={cn("overflow-hidden", className)} {...props}>
      {children}
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
