const { getDefaultConfig } = require("expo/metro-config");
const { withStorybook } = require("@storybook/react-native/metro/withStorybook");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// Storybook is in the bundle only when EXPO_PUBLIC_STORYBOOK is 1 (the development and e2e variants). app.config.ts refuses it in
// preview and production.
const withStories = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK === "1",
  configPath: "./.rnstorybook",
});

// Uniwind has to be the outermost wrapper (https://docs.uniwind.dev/api/with-uniwind-config).
module.exports = withUniwindConfig(withStories, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./uniwind-types.d.ts",
});
