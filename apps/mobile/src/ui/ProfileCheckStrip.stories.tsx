import type { Meta, StoryObj } from "@storybook/react-native";
import { HANDLE_REJECT_REASONS } from "@turnout/contract/profile";
import { ProfileCheckStrip } from "./ProfileCheckStrip";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/ProfileCheckStrip", component: ProfileCheckStrip };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Pending: Story = {
  render: () => (
    <Matrix padded>
      <ProfileCheckStrip state="pending" />
    </Matrix>
  ),
};

export const Rejected: Story = {
  render: () => (
    <Matrix padded>
      {HANDLE_REJECT_REASONS.map((reason) => (
        <ProfileCheckStrip key={reason} state="rejected" reason={reason} onChange={noop} />
      ))}
      <ProfileCheckStrip state="rejected" reason={null} onChange={noop} />
    </Matrix>
  ),
};
