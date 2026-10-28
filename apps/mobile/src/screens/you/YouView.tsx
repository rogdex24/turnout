import { SignOut } from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { you } from "@/copy/you";
import { Row } from "@/ui/primitives/Row";
import { Text } from "@/ui/primitives/Text";

export interface YouViewProps {
  onSignOut: () => void;
}

/** The You tab. Settings and safety grow here in M4; M2 has the way out. */
export function YouView({ onSignOut }: YouViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]} testID="you">
      <Text variant="title-large" className="px-4 pt-4" accessibilityRole="header">
        {you.title}
      </Text>
      <Row className="mt-4" icon={SignOut} title={you.signOut} onPress={onSignOut} />
    </SafeAreaView>
  );
}
