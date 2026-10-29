import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { resolveTapRoute } from "@/api/notifications";
import { useApi } from "./hooks";

/** Routes a push made of the link's three fields the way a tap on a real one is routed, then replaces itself with that screen. */
export function PushHook() {
  const api = useApi();
  const { kind, noticeId, planId } = useLocalSearchParams<{ kind?: string; noticeId?: string; planId?: string }>();
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    void resolveTapRoute(api, { kind, noticeId, planId: planId ?? null }).then(setRoute);
  }, [api, kind, noticeId, planId]);

  return route === null ? null : <Redirect href={route as Parameters<typeof Redirect>[0]["href"]} />;
}
