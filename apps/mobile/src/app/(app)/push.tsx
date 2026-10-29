import { Redirect } from "expo-router";
import { appVariant } from "@/api/variant";
import { PushHook } from "@/providers/PushHook";

/** The e2e build's stand-in for tapping a notification. The link filter lets it through in that build only; any other build goes Home. */
export default function Push() {
  return appVariant() === "e2e" ? <PushHook /> : <Redirect href="/" />;
}
