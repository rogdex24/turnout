import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { LocationNative, LocationPermission } from "@/api/location";
import type { Point } from "@/model/walk";
import { useMeetLocation } from "./useMeetLocation";

function fakeNative(permission: LocationPermission, afterAsk: LocationPermission = permission) {
  let emit: (point: Point) => void = () => undefined;
  const stop = jest.fn();
  const native = {
    permission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => afterAsk),
    watch: jest.fn(async (onPoint: (point: Point) => void) => {
      emit = onPoint;
      return stop;
    }),
  } satisfies LocationNative;
  return { native, stop, emit: (point: Point) => emit(point) };
}

const CAFE_SIDE: Point = { lat: 17.44, lng: 78.37 };

describe("useMeetLocation", () => {
  it("reads the permission without asking and does not watch without it", async () => {
    const fake = fakeNative({ status: "undetermined", canAskAgain: true });
    const { result } = await renderHook(() => useMeetLocation(fake.native, { focused: true, watching: true }));
    await waitFor(() => expect(result.current.permission).toBe("undetermined"));
    expect(fake.native.requestPermission).not.toHaveBeenCalled();
    expect(fake.native.watch).not.toHaveBeenCalled();
  });

  it("asks only when told to, then starts watching", async () => {
    const fake = fakeNative({ status: "undetermined", canAskAgain: true }, { status: "granted", canAskAgain: true });
    const { result } = await renderHook(() => useMeetLocation(fake.native, { focused: true, watching: true }));
    await waitFor(() => expect(result.current.permission).toBe("undetermined"));
    await act(async () => result.current.request());
    await waitFor(() => expect(fake.native.watch).toHaveBeenCalledTimes(1));
    expect(result.current.permission).toBe("granted");
    await act(async () => fake.emit(CAFE_SIDE));
    expect(result.current.point).toEqual(CAFE_SIDE);
  });

  it("stops and forgets the point when the card loses focus", async () => {
    const fake = fakeNative({ status: "granted", canAskAgain: true });
    const { result, rerender } = await renderHook(
      (props: { focused: boolean }) => useMeetLocation(fake.native, { focused: props.focused, watching: true }),
      {
        initialProps: { focused: true },
      },
    );
    await waitFor(() => expect(fake.native.watch).toHaveBeenCalled());
    await act(async () => fake.emit(CAFE_SIDE));
    await rerender({ focused: false });
    expect(fake.stop).toHaveBeenCalled();
    expect(result.current.point).toBeNull();
  });

  it("does not watch once the show has started", async () => {
    const fake = fakeNative({ status: "granted", canAskAgain: true });
    const { result } = await renderHook(() => useMeetLocation(fake.native, { focused: true, watching: false }));
    await waitFor(() => expect(result.current.permission).toBe("granted"));
    expect(fake.native.watch).not.toHaveBeenCalled();
  });

  it("keeps a denied answer that cannot be asked again", async () => {
    const fake = fakeNative({ status: "denied", canAskAgain: false });
    const { result } = await renderHook(() => useMeetLocation(fake.native, { focused: true, watching: true }));
    await waitFor(() => expect(result.current.permission).toBe("denied"));
    expect(result.current.canAskAgain).toBe(false);
  });
});
