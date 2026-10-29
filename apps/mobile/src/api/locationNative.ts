import * as Location from "expo-location";
import type { LocationNative, LocationPermission } from "./location";

function toPermission(response: Location.LocationPermissionResponse): LocationPermission {
  return {
    status: response.granted ? "granted" : response.status === Location.PermissionStatus.DENIED ? "denied" : "undetermined",
    canAskAgain: response.canAskAgain,
  };
}

/** The phone's location service, foreground only. Jest swaps this module for a fake. */
export const nativeLocation: LocationNative = {
  async permission() {
    return toPermission(await Location.getForegroundPermissionsAsync());
  },
  async requestPermission() {
    return toPermission(await Location.requestForegroundPermissionsAsync());
  },
  async watch(onPoint) {
    const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 25 }, (fix) =>
      onPoint({ lat: fix.coords.latitude, lng: fix.coords.longitude }),
    );
    return () => subscription.remove();
  },
};
