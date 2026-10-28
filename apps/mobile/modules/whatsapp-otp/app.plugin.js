const { withAndroidManifest } = require("expo/config-plugins");
const { addWhatsAppOtp } = require("./plugin/manifest");

/** Config plugin for the WhatsApp one-tap code module. Android only: iOS has no handshake and needs nothing. */
module.exports = function withWhatsAppOtp(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addWhatsAppOtp(modConfig.modResults);
    return modConfig;
  });
};
