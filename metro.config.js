// metro.config.js
// Enables package-exports resolution (required for three.js ≥ r150 which uses
// the "exports" field in its package.json to expose different bundles for ESM
// vs CJS consumers).  Without this flag Metro falls back to the "main" field
// (three.cjs) which works, but enabling it also gives correct resolution for
// postprocessing and other modern dual-format packages.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to understand the "exports" field in package.json so it picks
// the correct (CJS) entry-point for both three.js and postprocessing on all
// platforms including web.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
