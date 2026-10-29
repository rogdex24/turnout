// Board: B16.1
import { Stack } from "expo-router";
import { nativePush } from "@/api/pushNative";
import { useNotificationRouting } from "@/providers/useNotificationRouting";
import { useColors } from "@/ui/theme";

/**
 * Every pushed screen is a Stack screen, so the system back (and the predictive back on Android) pops it. Each screen draws its own
 * back button. This layout is also where a tapped notification is routed and the push token is given to the server.
 */
export default function AppLayout() {
  const colors = useColors();
  useNotificationRouting(nativePush);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
