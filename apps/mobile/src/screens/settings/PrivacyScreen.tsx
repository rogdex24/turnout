import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { useMe } from "@/providers/hooks";
import { PrivacyView } from "./PrivacyView";

/**
 * The notice text is the one the app carries (the same `NOTICE_PARAGRAPHS` the notice screen shows before sign-in), so it opens with
 * no network. The version is the one this account agreed to; a member who has not agreed to the current one is sent to the notice
 * screen by the gates before they could reach here.
 */
export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  const me = useMe().data;
  return <PrivacyView version={me?.consent.noticeVersion ?? NOTICE_VERSION} onBack={onBack} />;
}
