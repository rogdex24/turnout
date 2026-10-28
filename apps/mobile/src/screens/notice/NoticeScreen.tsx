import { useMutation, useQuery } from "@tanstack/react-query";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { configQuery } from "@/api/config";
import { postConsent, updateCachedMe } from "@/api/profile";
import { notice } from "@/copy/notice";
import { isApiError } from "@/model/apiError";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useLocalFlags, useSessionState } from "@/providers/hooks";
import { type GrievanceState, NoticeView } from "./NoticeView";

/** What the person is told when the consent call fails. A moved notice version is the one failure with its own words. */
export function consentFailureText(error: unknown): string {
  if (!isApiError(error)) return notice.errors.server;
  if (error.kind === "offline") return notice.errors.offline;
  if (error.code === "unknown_notice_version") return notice.errors.updateApp;
  return notice.errors.server;
}

/**
 * Signed out, agreeing stores the version on this phone, and the sign-in request carries it. Signed in (the notice moved while the
 * app was installed), agreeing records it on the account with `POST /me/consent`; the cached `me` then says it is current and the
 * router moves on by itself.
 */
export function NoticeScreen() {
  const api = useApi();
  const { queryClient } = useDeps();
  const { status } = useSessionState();
  const { acceptNotice } = useLocalFlags();
  const config = useQuery(configQuery(api));
  const consent = useMutation({
    mutationFn: () => postConsent(api, NOTICE_VERSION),
    onSuccess: ({ noticeVersion }) => updateCachedMe(queryClient, (me) => ({ ...me, consent: { noticeVersion, current: true } })),
  });
  const signedIn = status === "signed_in";

  // No answer yet and no way to get one is a failure to show, not a spinner to wait on.
  const stalled = config.data === undefined && (config.isError || config.fetchStatus === "paused");
  let grievance: GrievanceState = { kind: "loading" };
  if (config.data) grievance = { kind: "ready", officer: config.data.grievance };
  else if (stalled) grievance = { kind: "failed" };

  return (
    <NoticeView
      grievance={grievance}
      onRetryGrievance={() => void config.refetch()}
      changed={signedIn}
      agreeing={consent.isPending}
      error={consent.isError ? consentFailureText(consent.error) : null}
      onAgree={() => (signedIn ? consent.mutate() : acceptNotice(NOTICE_VERSION))}
    />
  );
}
