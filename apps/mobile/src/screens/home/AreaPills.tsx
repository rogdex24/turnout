import { ScrollView } from "react-native";
import { home } from "@/copy/home";
import { Chip } from "@/ui/primitives/Chip";

export interface AreaPillsProps {
  areas: { slug: string; label: string }[];
  /** The chosen area's slug, or null for every area. */
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

/** One row of area pills that scrolls sideways. "All areas" comes first and is on by default. */
export function AreaPills({ areas, selected, onSelect }: AreaPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={home.areas.label}
      contentContainerClassName="gap-2 px-4"
      testID="area-pills"
    >
      <Chip label={home.areas.all} selected={selected === null} onPress={() => onSelect(null)} testID="area-all" />
      {areas.map((area) => (
        <Chip
          key={area.slug}
          label={area.label}
          selected={selected === area.slug}
          onPress={() => onSelect(area.slug)}
          testID={`area-${area.slug}`}
        />
      ))}
    </ScrollView>
  );
}
