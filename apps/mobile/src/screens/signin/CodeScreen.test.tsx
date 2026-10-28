import { act, fireEvent, screen } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { SECRET_KEYS } from "@/api/secureStorage";
import { json, type RouteReply, tokenPairBody } from "@/api/testing";
import { signin } from "@/copy/signin";
import { CodeScreen } from "./CodeScreen";
import { SAMPLE_LABEL } from "./fixtures";
import { mountSignIn, TEST_PHONE } from "./testHarness";

jest.mock("expo-clipboard", () => ({ getStringAsync: jest.fn() }));

const SENT_AT = new Date("2026-10-28T10:00:00.000Z").getTime();
const errorBody = (code: string) => ({ error: { code, message: code } });
const status = (deliveryStatus: string) => json(200, { deliveryStatus });
const NEW_CODE = { challengeId: "c-2", expiresAt: "2026-10-28T10:20:00.000Z" };

async function open(routes: Record<string, RouteReply | RouteReply[]> = {}) {
  const onChangeNumber = jest.fn();
  const app = await mountSignIn(<CodeScreen onChangeNumber={onChangeNumber} />, {
    routes: { "GET /auth/otp/c-1": status("sent"), ...routes },
    challenge: { phone: TEST_PHONE, challengeId: "c-1", sentAt: SENT_AT, resendOpensAt: SENT_AT + 30_000 },
  });
  await app.whatsapp.startHandshake();
  return { ...app, onChangeNumber };
}

const typeCode = (text: string) => fireEvent.changeText(screen.getByTestId("code-field-input"), text);
const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  jest.useFakeTimers({ now: SENT_AT });
  (Clipboard.getStringAsync as jest.Mock).mockReset();
});
afterEach(() => jest.useRealTimers());

describe("CodeScreen", () => {
  test("names the number the code went to and says WhatsApp", async () => {
    await open();
    expect(screen.getByText(signin.code.lead(SAMPLE_LABEL))).toBeOnTheScreen();
    expect(signin.code.lead("x")).toContain("WhatsApp");
  });

  test("six typed digits check the code and sign in", async () => {
    const { transport, secure } = await open({ "POST /auth/otp/verify": json(200, tokenPairBody("u-1", "a", 900_000, SENT_AT)) });
    await typeCode("482913");
    const [call] = transport.callsTo("POST /auth/otp/verify");
    expect(JSON.parse(String(call?.body))).toMatchObject({
      challengeId: "c-1",
      phone: TEST_PHONE,
      code: "482913",
      noticeVersion: "2026-10-26",
    });
    expect(await secure.get(SECRET_KEYS.refreshToken)).not.toBeNull();
  });

  test("five digits wait", async () => {
    const { transport } = await open();
    await typeCode("48291");
    expect(transport.callsTo("POST /auth/otp/verify")).toHaveLength(0);
  });

  test("a code from WhatsApp one-tap fills the boxes and signs in", async () => {
    const { transport, whatsapp } = await open({ "POST /auth/otp/verify": json(200, tokenPairBody("u-1", "a", 900_000, SENT_AT)) });
    await act(async () => whatsapp.deliver("135790"));
    expect(JSON.parse(String(transport.callsTo("POST /auth/otp/verify")[0]?.body))).toMatchObject({ code: "135790" });
  });

  test("paste takes the six digits from the clipboard", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue("Your code is 246810");
    const { transport } = await open({ "POST /auth/otp/verify": json(200, tokenPairBody("u-1", "a", 900_000, SENT_AT)) });
    await fireEvent.press(screen.getByTestId("paste-code"));
    expect(JSON.parse(String(transport.callsTo("POST /auth/otp/verify")[0]?.body))).toMatchObject({ code: "246810" });
  });

  test("paste with nothing useful says so and sends nothing", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue("hello");
    const { transport } = await open();
    await fireEvent.press(screen.getByTestId("paste-code"));
    expect(screen.getByText(signin.code.pasteEmpty)).toBeOnTheScreen();
    expect(transport.callsTo("POST /auth/otp/verify")).toHaveLength(0);
  });

  test("a wrong code counts the tries left and clears the boxes", async () => {
    await open({ "POST /auth/otp/verify": json(401, errorBody("invalid_code")) });
    await typeCode("111111");
    expect(screen.getByText(signin.code.wrong(4))).toBeOnTheScreen();
    expect(screen.getByTestId("code-field-input").props.value).toBe("");
  });

  test("the fifth wrong code cancels it and offers a new one at once", async () => {
    await open({ "POST /auth/otp/verify": json(401, errorBody("invalid_code")) });
    for (let i = 0; i < 5; i += 1) await typeCode("111111");
    expect(screen.getByText(signin.code.tooManyTries)).toBeOnTheScreen();
    expect(screen.getByText(signin.code.notThereYet)).toBeOnTheScreen();
  });

  test("a refusal says the same sentence as on the phone step", async () => {
    await open({ "POST /auth/otp/verify": json(403, errorBody("sign_in_unavailable")) });
    await typeCode("111111");
    expect(screen.getByText("We can't sign you in with this number.")).toBeOnTheScreen();
  });

  test("Not there yet? is hidden for a minute, then Send again asks for a new code", async () => {
    const { transport } = await open({ "POST /auth/otp": json(200, NEW_CODE), "GET /auth/otp/c-2": status("sent") });
    expect(screen.queryByText(signin.code.notThereYet)).toBeNull();
    await advance(59_000);
    expect(screen.queryByText(signin.code.notThereYet)).toBeNull();
    await advance(2_000);
    expect(screen.getByText(signin.code.notThereYet)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("send-again"));
    expect(transport.callsTo("POST /auth/otp")).toHaveLength(1);
    expect(screen.getByText(signin.code.resent)).toBeOnTheScreen();
  });

  test("Send again waits 30 seconds, or the Retry-After when that is longer", async () => {
    await open({ "POST /auth/otp": json(429, errorBody("rate_limited"), "90") });
    await advance(61_000);
    await fireEvent.press(screen.getByTestId("send-again"));
    expect(screen.getByText(signin.code.wait(90))).toBeOnTheScreen();
    expect(screen.getByText(signin.code.sendAgainIn(90))).toBeOnTheScreen();
  });

  test("asks the server about the code every 3 seconds, for 2 minutes", async () => {
    const { transport } = await open();
    await advance(2_900);
    expect(transport.callsTo("GET /auth/otp/c-1")).toHaveLength(0);
    await advance(200);
    expect(transport.callsTo("GET /auth/otp/c-1")).toHaveLength(1);
    await advance(117_000);
    expect(transport.callsTo("GET /auth/otp/c-1")).toHaveLength(39);
    await advance(30_000);
    expect(transport.callsTo("GET /auth/otp/c-1")).toHaveLength(39);
  });

  test("undeliverable shows that the number is not on WhatsApp, with Change number only", async () => {
    const { onChangeNumber } = await open({ "GET /auth/otp/c-1": status("undeliverable") });
    await advance(3_100);
    expect(screen.getByText(signin.code.notOnWhatsApp.title)).toBeOnTheScreen();
    expect(screen.queryByTestId("code-field")).toBeNull();
    expect(screen.queryByTestId("paste-code")).toBeNull();
    expect(screen.queryByTestId("send-again")).toBeNull();
    await fireEvent.press(screen.getByTestId("change-number"));
    expect(onChangeNumber).toHaveBeenCalledTimes(1);
  });

  test("a failed delivery says the code did not arrive and offers Send again early", async () => {
    await open({ "GET /auth/otp/c-1": status("failed") });
    await advance(3_100);
    expect(screen.getByText(signin.code.notDelivered)).toBeOnTheScreen();
    expect(screen.getByTestId("send-again")).toBeOnTheScreen();
  });

  test("a poll that fails while offline is tried again", async () => {
    const { transport } = await open({ "GET /auth/otp/c-1": [new Error("down"), status("sent")] });
    await advance(6_100);
    expect(transport.callsTo("GET /auth/otp/c-1")).toHaveLength(2);
    expect(screen.getByTestId("code-field")).toBeOnTheScreen();
  });

  test("the back button and Change number both go back", async () => {
    const { onChangeNumber } = await open();
    await fireEvent.press(screen.getByTestId("back"));
    await fireEvent.press(screen.getByTestId("change-number"));
    expect(onChangeNumber).toHaveBeenCalledTimes(2);
  });
});
