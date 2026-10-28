// Board: B1.1
import { useLocalFlags } from "@/providers/hooks";
import { WelcomeView } from "@/screens/welcome/WelcomeView";

export default function Welcome() {
  const { markWelcomeSeen } = useLocalFlags();
  return <WelcomeView onDone={markWelcomeSeen} />;
}
