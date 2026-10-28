const { getDefaultConfig } = require("expo/metro-config");
const { withStorybook } = require("@storybook/react-native/metro/withStorybook");
const { withUniwindConfig } = require("uniwind/metro");

const path = require("node:path");

const config = getDefaultConfig(__dirname);

// The contract package is ESM TypeScript that imports its siblings as `./category.js`, which tsc and Bun map to
// `category.ts`. Metro does not, so a relative `.js` import from inside the contract is retried without the suffix.
const contractDir = path.resolve(__dirname, "../../packages/contract");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js") && context.originModulePath.startsWith(contractDir + path.sep)) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

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
