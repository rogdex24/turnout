// Board: B14.1
import { useRouter } from "expo-router";
import { useDeps } from "@/providers/AppProviders";
import { YouScreen } from "@/screens/you/YouScreen";
import type { YouTarget } from "@/screens/you/YouView";

const ROUTES = {
  profile: "/settings/profile",
  social: "/settings/social",
  notifications: "/settings/notifications",
  blocked: "/settings/blocked",
  howMatching: "/settings/how-matching-works",
  privacy: "/settings/privacy",
  grievance: "/settings/grievance",
  deleteAccount: "/settings/delete-account",
} as const satisfies Record<YouTarget, string>;

export default function You() {
  const router = useRouter();
  const { session } = useDeps();
  return <YouScreen onOpen={(target) => router.push(ROUTES[target])} onSignOut={() => void session.signOut().catch(() => undefined)} />;
}
