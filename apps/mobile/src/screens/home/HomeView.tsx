import { SafeAreaView } from "react-native-safe-area-context";
import { home } from "@/copy/home";
import { Text } from "@/ui/primitives/Text";

/** The placeholder home: the wordmark and a line saying the events list is coming. Replaced by the Welcome screen and the events list in M2. */
export function HomeView() {
  return (
    <SafeAreaView className="flex-1 bg-bg px-4" testID="home">
      <Text variant="display-hero" className="mt-10 uppercase">
        {home.wordmark}
      </Text>
      <Text variant="body" className="mt-4 text-muted">
        {home.placeholder}
      </Text>
    </SafeAreaView>
  );
}
