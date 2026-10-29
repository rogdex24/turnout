import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useReducer } from "react";
import { configQuery } from "@/api/config";
import {
  foregroundBehavior,
  holdThreadPushes,
  onPermissionChanged,
  type PushNative,
  registerDevice,
  resolveTapRoute,
} from "@/api/notifications";
import { useDeps } from "./AppProviders";
import { useSessionState } from "./hooks";

/**
 * Everything the phone's notifications need once a person is in the app: the Android channels, how a push is shown while the app
 * is open, where a tap goes, and giving the server this phone's token. This never asks the system's permission question: the ticket
 * page asks, after the first ticket is sent, and says so through `permissionChanged`, which runs the registration again.
 */
export function useNotificationRouting(native: PushNative): void {
  const { api, prefs } = useDeps();
  const router = useRouter();
  const { status, userId } = useSessionState();
  const signedIn = status === "signed_in";
  const config = useQuery({ ...configQuery(api), enabled: signedIn });
  const push = config.data?.push;
  const [asked, noteAsked] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onPermissionChanged(noteAsked), []);

  useEffect(() => {
    void native.setUpChannels().catch(() => undefined);
    native.setForegroundHandler((data) => foregroundBehavior(api, data));
    return native.onTap((data) => {
      void resolveTapRoute(api, data).then((route) => router.navigate(route as Parameters<typeof router.navigate>[0]));
    });
  }, [native, api, router]);

  // `asked` re-runs this after the ticket page's question, so a fresh grant reaches the server.
  useEffect(() => {
    if (!signedIn || !push) return;
    // The channels exist before Android 13 can show its own question, so they are made first.
    void native
      .setUpChannels()
      .catch(() => undefined)
      .then(() => registerDevice({ api, prefs, native, pushEnabled: push, userId, mayAsk: false }))
      .catch(() => undefined);
  }, [api, prefs, native, signedIn, push, userId, asked]);
}

/** The thread screen calls this with its group while it is open, so a message for that thread does not also ring as a banner. */
export function useHoldThreadPushes(groupId: string): void {
  useEffect(() => holdThreadPushes(groupId), [groupId]);
}
