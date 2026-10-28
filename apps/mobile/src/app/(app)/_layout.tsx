// Board: B16.1
import { Stack } from "expo-router";
import { useColors } from "@/ui/theme";

/** Every pushed screen is a Stack screen, so the system back (and the predictive back on Android) pops it. Each screen draws its own back button. */
export default function AppLayout() {
  const colors = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
