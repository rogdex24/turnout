import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";

/** The app could not start: the keychain would not open, or the signed-in member could not be loaded and none is saved on the phone. */
export function StartFailed(props: Pick<ErrorStateProps, "kind" | "onRetry">) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="start-failed">
      <View className="flex-1 justify-center">
        <ErrorState {...props} />
      </View>
    </SafeAreaView>
  );
}
