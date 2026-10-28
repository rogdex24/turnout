/** The profile form: onboarding after sign-in, and Settings later. */
export const profile = {
  title: "Your profile",
  lead: "First name and photo are what your group sees.",
  photo: {
    label: "Your photo",
    add: "Add a photo",
    change: "Change photo",
    hint: "A clear photo of your face, so the people in your group can find you.",
    uploading: (percent: number) => `Uploading your photo, ${percent}%`,
    ready: "Photo ready to save",
    picking: "Opening your photos",
    errors: {
      required: "Add a photo of your face to continue.",
      unreadable: "We couldn't read that picture. Choose a JPEG or PNG.",
      tooLarge: "That picture is too large. Choose another one.",
    },
  },
  firstName: {
    label: "First name",
    errors: {
      required: "Enter your first name.",
      tooLong: "Use 40 letters or fewer.",
      rejected: "We couldn't use that name. Try another.",
    },
  },
  gender: {
    label: "Gender",
    woman: "Woman",
    man: "Man",
    nonBinary: "Non-binary",
    errors: { required: "Choose one." },
  },
  handle: {
    label: "Instagram or LinkedIn",
    placeholder: "@name or a profile link",
    /** The plan's approved wording for why the handle is asked for. */
    why: "So we can check you're a real person. Others in your group never see it.",
    errors: {
      required: "Add your Instagram or LinkedIn.",
      invalid: "That isn't an Instagram or LinkedIn handle. Paste your handle or the link to your profile.",
      locked: "Your handle can't change while you're in a group.",
      limit: "You've changed your handle too many times today. Try again tomorrow.",
    },
  },
  womenOnly: {
    title: "Women and non-binary groups only",
    body: "Only women and non-binary people who chose this.",
    error: "Women-only groups are for women and non-binary people.",
  },
  save: "Save",
  saved: "Saved",
  errors: {
    offline: "You're offline. Connect and save again.",
    server: "Something went wrong on our side. Try again in a moment.",
    rateLimited: "Too many tries. Wait a moment and save again.",
  },
} as const;
