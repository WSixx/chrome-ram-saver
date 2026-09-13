import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/*.zip",
      "**/tests/.tmp-profile/**"
    ]
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.webextensions,
        chrome: "readonly",
        I18n: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-constant-condition": "warn",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "valid-typeof": "error",
      "no-redeclare": "error"
    }
  }
];
