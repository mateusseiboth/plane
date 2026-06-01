// Default Expo Metro config. The app is intentionally kept out of the pnpm
// workspace (see pnpm-workspace.yaml) so it has a flat node_modules tree and
// needs no extra watchFolders / nodeModulesPaths tweaking.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
