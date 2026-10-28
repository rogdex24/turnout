import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/ui/primitives/Text";

/** A screen that is not built yet, so the route exists and the guards can be tested. Each one is replaced by its task (A4 to A6). */
export function Stub({ name }: { name: string }) {
  return (
    <SafeAreaView className="flex-1 bg-bg px-4" testID={name}>
      <Text variant="title-large" className="mt-10">
        {name}
      </Text>
    </SafeAreaView>
  );
}
