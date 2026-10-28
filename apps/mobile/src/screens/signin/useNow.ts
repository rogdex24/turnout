import { useEffect, useState } from "react";

/** The clock, read again every `everyMs`. Drives the resend countdown and "Not there yet?". */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
