import { useEffect, useState } from "react";
import { bootApp } from "./boot";
import type { AppDeps } from "./deps";

type Boot = { state: "starting" } | { state: "failed" } | { state: "ready"; deps: AppDeps };

function load(setter: (next: Boot) => void) {
  bootApp().then(
    (deps) => setter({ state: "ready", deps }),
    () => setter({ state: "failed" }),
  );
}

/** Opens the stores once. `retry` runs it again after a failure (a keychain that was locked, say). */
export function useBoot(): { boot: Boot; retry: () => void } {
  const [boot, setBoot] = useState<Boot>({ state: "starting" });

  useEffect(() => {
    let live = true;
    load((next) => live && setBoot(next));
    return () => {
      live = false;
    };
  }, []);

  return {
    boot,
    retry() {
      setBoot({ state: "starting" });
      load(setBoot);
    },
  };
}
