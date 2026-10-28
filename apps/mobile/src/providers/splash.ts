import * as SplashScreen from "expo-splash-screen";

/** The splash stays up until the first gate answer, so no screen shows and is then replaced by another. Called once, at module load. */
export function holdSplash(): void {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

export function releaseSplash(): void {
  SplashScreen.hide();
}
