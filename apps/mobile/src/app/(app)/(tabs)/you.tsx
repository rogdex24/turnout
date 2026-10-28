// Board: B14.1
import { useDeps } from "@/providers/AppProviders";
import { YouView } from "@/screens/you/YouView";

export default function You() {
  const { session } = useDeps();
  return <YouView onSignOut={() => void session.signOut()} />;
}
