import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser clipboard helper. Returns a callback that writes the supplied
 * value to the system clipboard and a small "status" state the caller
 * can render. The status auto-clears after a short window so transient
 * confirmations do not pile up.
 *
 * Local-first honesty: the browser sandbox cannot open Finder/Explorer
 * directly. "Copy the path so I can paste it into my file manager" is
 * the deliberate, privacy-preserving substitute used by the Sync
 * Storage tab for the "reveal database" / "reveal data directory" UX.
 */
export interface ClipboardCopyState {
  status: "idle" | "copied" | "error";
  message?: string;
}

export interface UseCopyToClipboardResult {
  state: ClipboardCopyState;
  copy: (value: string) => Promise<void>;
}

const DEFAULT_RESET_MS = 2000;

function isClipboardAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard !== "undefined" &&
    typeof navigator.clipboard.writeText === "function"
  );
}

export function useCopyToClipboard(
  resetMs: number = DEFAULT_RESET_MS,
): UseCopyToClipboardResult {
  const [state, setState] = useState<ClipboardCopyState>({ status: "idle" });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  const scheduleReset = useCallback(() => {
    clearTimer();
    resetTimer.current = setTimeout(() => {
      setState({ status: "idle" });
      resetTimer.current = null;
    }, resetMs);
  }, [clearTimer, resetMs]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const copy = useCallback(
    async (value: string) => {
      if (!isClipboardAvailable()) {
        setState({
          status: "error",
          message: "Clipboard access is not available in this browser.",
        });

        return;
      }

      const trimmed = value.trim();

      if (trimmed.length === 0) {
        setState({ status: "error", message: "Nothing to copy." });

        return;
      }

      try {
        await navigator.clipboard.writeText(trimmed);
        setState({ status: "copied" });
        scheduleReset();
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The browser refused clipboard access.",
        });
      }
    },
    [scheduleReset],
  );

  return { state, copy };
}
