import fs from "node:fs";
import path from "node:path";
import { type ConfigPlugin, withAndroidManifest, withDangerousMod } from "expo/config-plugins";

/**
 * `allowBackup: false` stops cloud backup, but from Android 12 it does not stop a device-to-device transfer. That needs
 * `android:dataExtractionRules` pointing at rules that exclude every domain under both `<cloud-backup>` and `<device-transfer>`.
 * This plugin writes the rules file and points the manifest at it, so nothing in the app's data folder follows the person to a
 * new phone: the cache key lives in the keystore and cannot follow, and the member id, push token and device id in prefs must not.
 */
export const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </device-transfer>
</data-extraction-rules>
`;

export const RULES_RESOURCE = "@xml/data_extraction_rules";

export const withNoDataExtraction: ConfigPlugin = (config) => {
  const withManifest = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error("The Android manifest has no application element");
    application.$["android:dataExtractionRules"] = RULES_RESOURCE;
    return mod;
  });
  return withDangerousMod(withManifest, [
    "android",
    (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "data_extraction_rules.xml"), DATA_EXTRACTION_RULES);
      return mod;
    },
  ]);
};
