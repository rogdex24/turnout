import { View } from "react-native";
import { ErrorState, type ErrorStateProps } from "@/ui/ErrorState";
import { SafeAreaView } from "@/ui/primitives/SafeAreaView";

/** The app could not start: the keychain would not open, or the signed-in member could not be loaded and none is saved on the phone. */
export function StartFailed(props: Pick<ErrorStateProps, "kind" | "message" | "onRetry">) {
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="start-failed">
      <View className="flex-1 justify-center">
        <ErrorState {...props} />
      </View>
    </SafeAreaView>
  );
}
