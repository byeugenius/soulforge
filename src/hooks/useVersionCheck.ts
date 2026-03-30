import { useEffect } from "react";
import { useVersionStore } from "../stores/version.js";

/** Kick off a background version check once on mount. */
export function useVersionCheck(): void {
  const check = useVersionStore((s) => s.check);
  useEffect(() => {
    // Small delay so it doesn't compete with boot-time work
    const timer = setTimeout(() => {
      check();
    }, 3000);
    return () => clearTimeout(timer);
  }, [check]);
}
