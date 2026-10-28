import { SafeAreaView as BaseSafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

/**
 * The safe-area-context SafeAreaView with className support. Uniwind styles react-native's own components only, so the bare
 * import drops every class without an error (the notice screen collapsed to its button on Android). Biome forbids the bare import.
 */
export const SafeAreaView = withUniwind(BaseSafeAreaView);
