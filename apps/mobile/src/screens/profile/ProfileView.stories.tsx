import type { Meta, StoryObj } from "@storybook/react-native";
import { profile } from "@/copy/profile";
import { EMPTY_DRAFT, type ProfileDraft } from "@/model/profileForm";
import { Matrix } from "@/ui/storybook/Matrix";
import { ProfileView, type ProfileViewProps } from "./ProfileView";

const meta: Meta = { title: "Screens/Profile", component: ProfileView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const handlers = { onFirstName: noop, onGender: noop, onHandle: noop, onWomenOnly: noop, onChangePhoto: noop, onSave: noop };
const FILLED: ProfileDraft = { firstName: "Ananya", gender: "woman", groupPref: "open", handleInput: "@ananya.k" };
const PHOTO = "https://example.com/photo.jpg";

function frame(props: Partial<ProfileViewProps>) {
  return (
    <Matrix framed>
      <ProfileView draft={FILLED} photoUrl={PHOTO} {...handlers} {...props} />
    </Matrix>
  );
}

export const Empty: Story = { render: () => frame({ draft: EMPTY_DRAFT, photoUrl: null }) };
export const Filled: Story = { render: () => frame({}) };
export const WomenOnlyOn: Story = { render: () => frame({ draft: { ...FILLED, groupPref: "women_only" } }) };
export const ManHasNoSwitch: Story = { render: () => frame({ draft: { ...FILLED, gender: "man" } }) };
export const PickingPhoto: Story = { render: () => frame({ photoStatus: "picking" }) };
export const PhotoPicked: Story = { render: () => frame({ photoStatus: "picked" }) };
export const Uploading: Story = { render: () => frame({ photoStatus: "uploading", uploadFraction: 0.4, saving: true }) };
export const Saving: Story = { render: () => frame({ saving: true }) };
export const Saved: Story = { render: () => frame({ saved: true, onBack: noop }) };
export const SettingsWithBack: Story = { render: () => frame({ onBack: noop }) };
export const MissingPieces: Story = {
  render: () =>
    frame({
      draft: EMPTY_DRAFT,
      photoUrl: null,
      errors: {
        firstName: profile.firstName.errors.required,
        gender: profile.gender.errors.required,
        photo: profile.photo.errors.required,
        handle: profile.handle.errors.required,
      },
    }),
};
export const PhotoRefused: Story = { render: () => frame({ errors: { photo: profile.photo.errors.unreadable } }) };
export const HandleLocked: Story = { render: () => frame({ errors: { handle: profile.handle.errors.locked } }) };
export const HandleLimit: Story = { render: () => frame({ errors: { handle: profile.handle.errors.limit } }) };
export const Offline: Story = { render: () => frame({ errors: { form: profile.errors.offline } }) };
