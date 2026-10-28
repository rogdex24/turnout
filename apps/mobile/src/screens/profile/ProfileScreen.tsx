import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { runSave, SaveError } from "@/api/saveProfile";
import { profile } from "@/copy/profile";
import { isApiError } from "@/model/apiError";
import { draftFromMe, hasProblems, type ProfileDraft, saveSteps, validateDraft, withGender } from "@/model/profileForm";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useMe } from "@/providers/hooks";
import { problemsToErrors, saveErrorToErrors } from "./messages";
import { type PhotoStatus, ProfileView } from "./ProfileView";
import { choosePhoto, type PreparedPhoto, readPhoto } from "./photoFile";

export interface ProfileScreenProps {
  /** Settings passes a way back; the onboarding step has none. */
  onBack?: () => void;
}

/**
 * The profile form on the real account. Save validates first, then makes the calls the account still lacks, in order (profile,
 * photo, handle); each one updates the cached `me`, so the router leaves onboarding by itself and a failed save sends only what
 * is left. A refusal from the server shows next to its own field.
 */
export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const api = useApi();
  const { queryClient } = useDeps();
  const me = useMe().data;
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromMe(me));
  const [picked, setPicked] = useState<PreparedPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [fraction, setFraction] = useState<number | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof problemsToErrors>>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (steps: Parameters<typeof runSave>[1]) =>
      runSave(
        {
          api,
          queryClient,
          loadPhoto: () => (picked ? readPhoto(picked) : Promise.reject(new Error("no photo"))),
          onUploadProgress: setFraction,
        },
        steps,
      ),
    onMutate: () => {
      setErrors({});
      setSaved(false);
      setFraction(null);
    },
    onSuccess: () => {
      setPicked(null);
      setSaved(true);
    },
    onError: (error) => {
      // A failure after the picture went up leaves it stored, so it is not sent again.
      if (error instanceof SaveError) {
        if (error.step === "handle") setPicked(null);
        setErrors(saveErrorToErrors(error, draft));
      } else {
        setErrors({ form: profile.errors.server });
      }
    },
    onSettled: () => setFraction(null),
  });

  const edit = (change: (draft: ProfileDraft) => ProfileDraft, clears?: keyof typeof errors) => {
    setDraft(change);
    setSaved(false);
    if (clears) setErrors(({ [clears]: _gone, ...rest }) => rest);
  };

  const pickPhoto = async () => {
    setPicking(true);
    setSaved(false);
    try {
      const photo = await choosePhoto();
      if (photo) {
        setPicked(photo);
        setErrors(({ photo: _gone, ...rest }) => rest);
      }
    } catch (error) {
      setErrors((current) => ({ ...current, photo: isApiError(error) ? profile.errors.server : profile.photo.errors.unreadable }));
    } finally {
      setPicking(false);
    }
  };

  const submit = () => {
    const hasPhoto = picked !== null || me?.profile.photo != null;
    const problems = validateDraft(draft, { hasPhoto });
    if (hasProblems(problems)) {
      setErrors(problemsToErrors(problems));
      return;
    }
    const steps = saveSteps(draft, me, picked !== null);
    if (steps.length === 0) {
      setErrors({});
      setSaved(true);
      return;
    }
    save.mutate(steps);
  };

  let photoStatus: PhotoStatus = "idle";
  if (picking) photoStatus = "picking";
  else if (save.isPending && fraction !== null) photoStatus = "uploading";
  else if (picked) photoStatus = "picked";

  return (
    <ProfileView
      draft={draft}
      photoUrl={picked?.uri ?? me?.profile.photo?.url ?? null}
      photoStatus={photoStatus}
      uploadFraction={fraction ?? 0}
      errors={errors}
      saving={save.isPending}
      saved={saved}
      onBack={onBack}
      onFirstName={(text) => edit((d) => ({ ...d, firstName: text }), "firstName")}
      onGender={(gender) => edit((d) => withGender(d, gender), "gender")}
      onHandle={(text) => edit((d) => ({ ...d, handleInput: text }), "handle")}
      onWomenOnly={(on) => edit((d) => ({ ...d, groupPref: on ? "women_only" : "open" }), "womenOnly")}
      onChangePhoto={() => void pickPhoto()}
      onSave={submit}
    />
  );
}
