// Board: B13
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReportScreen } from "@/screens/report/ReportScreen";
import { useBlockCapture } from "@/ui/useBlockCapture";

export default function Report() {
  const router = useRouter();
  const { groupId, memberRef, messageId } = useLocalSearchParams<{ groupId: string; memberRef?: string; messageId?: string }>();
  useBlockCapture();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return <ReportScreen groupId={groupId} memberRef={memberRef} messageId={messageId} onBack={leave} onDone={leave} />;
}
