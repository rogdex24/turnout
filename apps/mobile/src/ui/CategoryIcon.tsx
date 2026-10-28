import type { Category } from "@turnout/contract/category";
import { iconCategory } from "@turnout/contract/category";
import {
  BowlFood,
  FilmSlate,
  Martini,
  MaskHappy,
  MicrophoneStage,
  MusicNotes,
  Palette,
  type Icon as PhosphorIcon,
  PuzzlePiece,
  SneakerMove,
  Sparkle,
  UsersThree,
} from "phosphor-react-native";
import { Icon, type IconProps } from "./primitives/Icon";

/** The Phosphor glyph for each category, the same names as `CATEGORY_ICON` in the contract (a test pins the pairing). */
export const CATEGORY_GLYPH: Record<Category, PhosphorIcon> = {
  comedy: MicrophoneStage,
  music: MusicNotes,
  theatre: MaskHappy,
  workshop: Palette,
  sports: SneakerMove,
  food: BowlFood,
  nightlife: Martini,
  community: UsersThree,
  kids: PuzzlePiece,
  film: FilmSlate,
  other: Sparkle,
};

export interface CategoryIconProps extends Omit<IconProps, "icon"> {
  /** A stored category. Anything unknown reads as "other". */
  category: string;
}

export function CategoryIcon({ category, ...rest }: CategoryIconProps) {
  return <Icon icon={CATEGORY_GLYPH[iconCategory(category)]} {...rest} />;
}
