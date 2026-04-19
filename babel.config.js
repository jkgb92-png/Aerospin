module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Three.js ≥ r155 uses static class blocks (e.g. `static { … }` inside
      // class bodies) which older Babel configs don't handle by default.
      // This plugin transpiles them so Metro can bundle three.js for the web.
      '@babel/plugin-transform-class-static-block',
    ],
  };
};
