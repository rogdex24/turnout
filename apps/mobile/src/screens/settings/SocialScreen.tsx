import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { runSave, SaveError } from "@/api/saveProfile";
import { profileCheck } from "@/copy/profileCheck";
import { parseHandleInput } from "@/model/handle";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useMe } from "@/providers/hooks";
import type { FieldInput } from "@/ui/primitives/Field";
import { SocialView } from "./SocialView";

const copy = profileCheck.social;

/** What a refusal of the handle says, next to the field. A fault with nothing to do with the handle gets the plain server line. */
function messageFor(error: unknown): string {
  if (!(error instanceof SaveError)) return copy.errors.server;
  const { reason } = error;
  if (reason.kind === "offline") return copy.errors.offline;
  if (reason.code === "handle_locked") return copy.errors.locked;
  if (reason.kind === "rate_limited") return copy.errors.limit;
  if (reason.kind === "validation") return copy.errors.invalid;
  return copy.errors.server;
}

/**
 * Change the handle on the real account. PUT /me/handle puts it back to `pending`, and the cached `me` says so at once, so the strip
 * above the field moves from turned down to checking without leaving the page. The handle stays in this component and the cached
 * `me`: it is never sent to analytics, an error report or a route.
 */
export function SocialScreen({ onBack }: { onBack: () => void }) {
  const api = useApi();
  const { queryClient } = useDeps();
  const me = useMe().data;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const field = useRef<FieldInput>(null);

  const save = useMutation({
    mutationFn: (body: NonNullable<ReturnType<typeof parseHandleInput>>) =>
      runSave({ api, queryClient, loadPhoto: () => Promise.reject(new Error("no photo")) }, [{ call: "handle", body }]),
    onSuccess: () => {
      setInput("");
      setSaved(true);
    },
    onError: (failure) => setError(messageFor(failure)),
  });

  const submit = () => {
    const parsed = parseHandleInput(input);
    setSaved(false);
    if (!parsed) {
      setError(copy.errors.invalid);
      return;
    }
    setError(null);
    save.mutate(parsed);
  };

  return (
    <SocialView
      held={{
        state: me?.handle.state ?? null,
        kind: me?.handle.kind ?? null,
        handle: me?.handle.handle ?? null,
        rejectReason: me?.handle.rejectReason ?? null,
      }}
      input={input}
      error={error}
      saving={save.isPending}
      saved={saved}
      announceStrip={saved}
      inputRef={field}
      onBack={onBack}
      onInput={(text) => {
        setInput(text);
        setError(null);
        setSaved(false);
      }}
      onSave={submit}
      onChangeHandle={() => field.current?.focus()}
    />
  );
}
