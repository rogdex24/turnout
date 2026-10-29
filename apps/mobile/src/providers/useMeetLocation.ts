import { useEffect, useState } from "react";
import type { LocationNative } from "@/api/location";
import type { PermissionState } from "@/model/meetCard";
import type { Point } from "@/model/walk";

export interface MeetLocation {
  permission: PermissionState;
  canAskAgain: boolean;
  /** The last fix, kept in memory for the walk line only. Null when not watching. */
  point: Point | null;
  /** Asks the system question. Call it from the person's tap, never on its own. */
  request(): void;
}

interface Options {
  /** The meet card is the screen the person is looking at. */
  focused: boolean;
  /** The card is live and the show has not started: after that nothing is watched. */
  watching: boolean;
}

/**
 * The phone's place for the meet card. The permission is read without asking, and again each time the card comes back into view (the
 * person may have changed it in Settings). The watch runs only with permission, in the foreground and before the show starts, and its
 * fixes go to this screen's state and nowhere else.
 */
export function useMeetLocation(native: LocationNative, { focused, watching }: Options): MeetLocation {
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [point, setPoint] = useState<Point | null>(null);

  useEffect(() => {
    if (!focused) return;
    let current = true;
    void native
      .permission()
      .then((answer) => {
        if (!current) return;
        setPermission(answer.status);
        setCanAskAgain(answer.canAskAgain);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [native, focused]);

  const watchingNow = focused && watching && permission === "granted";
  useEffect(() => {
    if (!watchingNow) return;
    let stop: (() => void) | null = null;
    let current = true;
    void native
      .watch((fix) => {
        if (current) setPoint(fix);
      })
      .then((stopWatching) => {
        if (current) stop = stopWatching;
        else stopWatching();
      })
      .catch(() => undefined);
    return () => {
      current = false;
      stop?.();
      setPoint(null);
    };
  }, [native, watchingNow]);

  function request() {
    void native
      .requestPermission()
      .then((answer) => {
        setPermission(answer.status);
        setCanAskAgain(answer.canAskAgain);
      })
      .catch(() => undefined);
  }

  return { permission, canAskAgain, point, request };
}
