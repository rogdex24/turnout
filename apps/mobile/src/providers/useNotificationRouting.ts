import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { configQuery } from "@/api/config";
import { plansListQuery } from "@/api/groups";
import { foregroundBehavior, holdThreadPushes, type PushNative, registerDevice, resolveTapRoute } from "@/api/notifications";
import { useDeps } from "./AppProviders";
import { useSessionState } from "./hooks";

/**
 * Everything the phone's notifications need once a person is in the app: the Android channels, how a push is shown while the app
 * is open, where a tap goes, and giving the server this phone's token. The system's permission question is asked only after the
 * person has a plan, because that is the first time there is anything to tell them.
 */
export function useNotificationRouting(native: PushNative): void {
  const { api, prefs } = useDeps();
  const router = useRouter();
  const { status, userId } = useSessionState();
  const signedIn = status === "signed_in";
  const config = useQuery({ ...configQuery(api), enabled: signedIn });
  const plans = useQuery({ ...plansListQuery(api), enabled: signedIn });
  const hasPlan = (plans.data?.plans.length ?? 0) > 0;
  const push = config.data?.push;

  useEffect(() => {
    void native.setUpChannels().catch(() => undefined);
    native.setForegroundHandler((data) => foregroundBehavior(api, data));
    return native.onTap((data) => {
      void resolveTapRoute(api, data).then((route) => router.navigate(route as Parameters<typeof router.navigate>[0]));
    });
  }, [native, api, router]);

  useEffect(() => {
    if (!signedIn || !push) return;
    void registerDevice({ api, prefs, native, pushEnabled: push, userId, mayAsk: hasPlan }).catch(() => undefined);
  }, [api, prefs, native, signedIn, push, userId, hasPlan]);
}

/** The thread screen calls this with its group while it is open, so a message for that thread does not also ring as a banner. */
export function useHoldThreadPushes(groupId: string): void {
  useEffect(() => holdThreadPushes(groupId), [groupId]);
}
