import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColors } from "@/ui/theme";

export default function RootLayout() {
  const colors = useColors();
  return (
    <GestureHandlerRootView className="flex-1 bg-bg">
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </GestureHandlerRootView>
  );
}
