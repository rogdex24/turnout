import { addWhatsAppOtp, OTP_RETRIEVED_ACTION, RECEIVER_ACTIVITY } from "./manifest";

interface Manifest {
  application: { activity: { $: Record<string, string> }[] }[];
  queries?: { intent?: unknown[]; package?: unknown[] }[];
}

function emptyManifest() {
  return {
    manifest: { application: [{ $: { "android:name": ".MainApplication" }, activity: [{ $: { "android:name": ".MainActivity" } }] }] },
  } as never;
}

describe("addWhatsAppOtp", () => {
  test("declares the exported receiver activity with the OTP_RETRIEVED action", () => {
    const { manifest } = addWhatsAppOtp(emptyManifest()) as { manifest: Manifest };
    const activity = manifest.application[0]?.activity.find((entry) => entry.$["android:name"] === RECEIVER_ACTIVITY);
    expect(activity?.$["android:exported"]).toBe("true");
    expect(
      (activity as unknown as { "intent-filter": { action: { $: Record<string, string> }[] }[] })["intent-filter"][0]?.action[0]?.$[
        "android:name"
      ],
    ).toBe(OTP_RETRIEVED_ACTION);
  });

  test("lets the app see both WhatsApp apps", () => {
    const { manifest } = addWhatsAppOtp(emptyManifest()) as { manifest: { queries: { package: { $: Record<string, string> }[] }[] } };
    expect(manifest.queries[0]?.package.map((entry) => entry.$["android:name"])).toEqual(["com.whatsapp", "com.whatsapp.w4b"]);
  });

  test("keeps the queries that are already there and adds nothing twice", () => {
    const start = emptyManifest() as unknown as { manifest: Manifest };
    start.manifest.queries = [
      {
        intent: [{ action: [{ $: { "android:name": "android.intent.action.VIEW" } }] }],
        package: [{ $: { "android:name": "com.whatsapp" } }],
      },
    ];
    addWhatsAppOtp(start as never);
    addWhatsAppOtp(start as never);
    expect(start.manifest.queries[0]?.intent).toHaveLength(1);
    expect(start.manifest.queries[0]?.package).toHaveLength(2);
    const receivers = start.manifest.application[0]?.activity.filter((entry) => entry.$["android:name"] === RECEIVER_ACTIVITY);
    expect(receivers).toHaveLength(1);
  });

  test("fails loudly when there is no application element", () => {
    expect(() => addWhatsAppOtp({ manifest: {} } as never)).toThrow("no <application>");
  });
});
