// Plain CommonJS: Expo loads config plugins without a build step.

const RECEIVER_ACTIVITY = "expo.modules.whatsappotp.WhatsAppOtpReceiverActivity";
const OTP_RETRIEVED_ACTION = "com.whatsapp.otp.OTP_RETRIEVED";
const WHATSAPP_PACKAGES = ["com.whatsapp", "com.whatsapp.w4b"];

/**
 * Adds what the one-tap handshake needs to the Android manifest: the exported activity WhatsApp launches with the code, and
 * <queries> for both WhatsApp apps so the installed check can see them. Safe to run twice.
 *
 * @param {{ manifest: any }} androidManifest the parsed manifest from withAndroidManifest
 */
function addWhatsAppOtp(androidManifest) {
  const manifest = androidManifest.manifest;

  manifest.queries ??= [{}];
  const queries = manifest.queries;
  queries[0] ??= {};
  queries[0].package ??= [];
  const packages = queries[0].package;
  for (const name of WHATSAPP_PACKAGES) {
    if (!packages.some((entry) => entry.$["android:name"] === name)) packages.push({ $: { "android:name": name } });
  }

  const application = manifest.application?.[0];
  if (!application) throw new Error("The Android manifest has no <application>.");
  application.activity ??= [];
  const activities = application.activity;
  if (!activities.some((entry) => entry.$["android:name"] === RECEIVER_ACTIVITY)) {
    activities.push({
      $: {
        "android:name": RECEIVER_ACTIVITY,
        "android:exported": "true",
        "android:enabled": "true",
        "android:noHistory": "true",
        "android:excludeFromRecents": "true",
        "android:launchMode": "singleTop",
        "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
      },
      "intent-filter": [{ action: [{ $: { "android:name": OTP_RETRIEVED_ACTION } }] }],
    });
  }
  return androidManifest;
}

module.exports = { addWhatsAppOtp, RECEIVER_ACTIVITY, OTP_RETRIEVED_ACTION, WHATSAPP_PACKAGES };
