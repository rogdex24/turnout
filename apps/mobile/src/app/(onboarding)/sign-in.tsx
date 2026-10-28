// Board: B2.1
import { router } from "expo-router";
import { PhoneScreen } from "@/screens/signin/PhoneScreen";

export default function SignIn() {
  return <PhoneScreen onSent={() => router.push("/code")} />;
}
