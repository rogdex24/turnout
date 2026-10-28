import { fireEvent, screen } from "@testing-library/react-native";
import { json } from "@/api/testing";
import { signin } from "@/copy/signin";
import { PhoneScreen } from "./PhoneScreen";
import { mountSignIn, TEST_NATIONAL, TEST_PHONE } from "./testHarness";

const CHALLENGE = { challengeId: "c-1", expiresAt: "2026-10-28T10:10:00.000Z" };
const errorBody = (code: string) => ({ error: { code, message: code } });

async function open(routes: Record<string, ReturnType<typeof json>> = {}, installed: boolean | null = true) {
  const onSent = jest.fn();
  const app = await mountSignIn(<PhoneScreen onSent={onSent} />, { routes, installed });
  return { ...app, onSent };
}

const type = (text: string) => fireEvent.changeText(screen.getByTestId("phone-input"), text);
const send = () => fireEvent.press(screen.getByTestId("send-code"));

describe("PhoneScreen", () => {
  test("the copy names WhatsApp", async () => {
    await open();
    expect(screen.getByText(signin.phone.lead)).toBeOnTheScreen();
    expect(signin.phone.lead).toContain("WhatsApp");
  });

  test.each([
    ["starts with 5", `5${TEST_NATIONAL.slice(1)}`],
    ["has nine digits", TEST_NATIONAL.slice(0, 9)],
    ["is empty", ""],
  ])("a number that %s is not sent", async (_name, text) => {
    const { transport, onSent } = await open();
    await type(text);
    await send();
    expect(screen.getByText(signin.phone.errors.badPhone)).toBeOnTheScreen();
    expect(transport.callsTo("POST /auth/otp")).toHaveLength(0);
    expect(onSent).not.toHaveBeenCalled();
  });

  test("ten digits starting 6 to 9 ask for a code with +91 and move on", async () => {
    const { transport, onSent, whatsapp } = await open({ "POST /auth/otp": json(200, CHALLENGE) });
    await type(TEST_NATIONAL);
    await send();
    const [call] = transport.callsTo("POST /auth/otp");
    expect(JSON.parse(String(call?.body))).toMatchObject({ phone: TEST_PHONE });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(whatsapp.handshakes()).toBe(1);
  });

  test("typing keeps digits only and drops a pasted +91", async () => {
    await open();
    await type(`+91 ${TEST_NATIONAL}`);
    expect(screen.getByTestId("phone-input").props.value.replace(/\D/g, "")).toBe(TEST_NATIONAL);
  });

  test("a refusal says one thing, whatever the reason", async () => {
    const { onSent } = await open({ "POST /auth/otp": json(403, errorBody("sign_in_unavailable")) });
    await type(TEST_NATIONAL);
    await send();
    expect(screen.getByText("We can't sign you in with this number.")).toBeOnTheScreen();
    expect(onSent).not.toHaveBeenCalled();
  });

  test("a rate limit shows the wait from Retry-After", async () => {
    await open({ "POST /auth/otp": json(429, errorBody("rate_limited"), "120") });
    await type(TEST_NATIONAL);
    await send();
    expect(screen.getByText(signin.phone.errors.wait(120))).toBeOnTheScreen();
  });

  test("a failed send cancels the handshake, so a late code is ignored", async () => {
    const { whatsapp } = await open({ "POST /auth/otp": json(502, errorBody("otp_send_failed")) });
    const heard = jest.fn();
    whatsapp.onCode(heard);
    await type(TEST_NATIONAL);
    await send();
    whatsapp.deliver("123456");
    expect(heard).not.toHaveBeenCalled();
    expect(screen.getByText(signin.phone.errors.couldNotSend)).toBeOnTheScreen();
  });

  test("a phone with no WhatsApp app is told the code can go to another phone", async () => {
    await open({}, false);
    expect(screen.getByText("We'll send the code on WhatsApp. It can be on another phone.")).toBeOnTheScreen();
  });

  test("a phone with WhatsApp gets the short help line", async () => {
    await open({}, true);
    expect(screen.getByText(signin.phone.help)).toBeOnTheScreen();
  });
});
