import { render } from "@testing-library/react-native";
import { memoryKv } from "../api/prefs";
import { useStartTelemetry } from "./useStartTelemetry";

const mockStart = jest.fn();
jest.mock("./index", () => ({ telemetry: () => ({ start: mockStart }) }));

function Probe() {
  useStartTelemetry(memoryKv());
  return null;
}

/** The frame callbacks the app asked for, to be run by hand when the test says the first frame is drawn. */
let frames: (() => void)[] = [];

beforeEach(() => {
  mockStart.mockClear();
  frames = [];
  jest.useFakeTimers();
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => frames.push(() => callback(0)));
  jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
    frames[(id ?? 0) - 1] = () => {};
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("starting telemetry", () => {
  test("nothing starts before the first frame is drawn, however long it takes", async () => {
    await render(<Probe />);
    jest.advanceTimersByTime(10_000);
    expect(mockStart).not.toHaveBeenCalled();
  });

  test("it starts once the first frame is drawn and the event loop has turned", async () => {
    await render(<Probe />);
    for (const frame of frames) frame();
    expect(mockStart).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  test("leaving before that cancels it", async () => {
    const view = await render(<Probe />);
    await view.unmount();
    for (const frame of frames) frame();
    jest.advanceTimersByTime(1000);
    expect(mockStart).not.toHaveBeenCalled();
  });
});
