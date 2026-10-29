import { requestPermissionsAsync } from "expo-notifications";

/**
 * Asks the system for permission to send notifications. It only asks: nothing is registered with the server here, that is the
 * device registration's own step. A refusal or a failure is not an error, the person can turn it on in Settings later.
 */
export async function askNotifications(): Promise<boolean> {
  try {
    const result = await requestPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}
