const js = require("@eslint/js");
const globals = require("globals");

const shared = {
  ...js.configs.recommended.rules,
  "no-unused-vars": ["error", { ignoreRestSiblings: true }]
};

module.exports = [
  { ignores: ["node_modules/"] },
  { files: ["src/**/*.js"], languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.browser }, rules: shared },
  { files: ["server/**/*.js", "test/**/*.js", "eslint.config.js", "**/*.cjs"], languageOptions: { ecmaVersion: 2024, sourceType: "commonjs", globals: globals.node }, rules: shared },
  { files: ["extension/**/*.js"], languageOptions: { ecmaVersion: 2024, sourceType: "script", globals: { ...globals.browser, ...globals.webextensions } }, rules: shared }
];
