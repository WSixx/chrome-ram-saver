import globals from "globals";

const sharedRules = {
  "no-undef": "error",
  "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
  "no-constant-condition": "warn",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",
  "valid-typeof": "error",
  "no-redeclare": "error",
  "no-var": "error",
  "prefer-const": "warn",
  "eqeqeq": ["error", "smart"],
  "no-shadow": "warn"
};

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
    files: ["background/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.serviceworker,
        ...globals.webextensions,
        chrome: "readonly",
        // Page-context callbacks passed to chrome.scripting.executeScript() access document
        document: "readonly"
      }
    },
    rules: sharedRules
  },
  {
    files: ["popup/**/*.js", "options/**/*.js", "utils/i18n.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
        I18n: "readonly"
      }
    },
    rules: sharedRules
  },
  {
    files: ["utils/shared.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        module: "readonly"
      }
    },
    rules: sharedRules
  },
  {
    files: ["scripts/**/*.js", "jest.config.js", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    files: ["tests/unit/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: sharedRules
  },
  {
    files: ["tests/e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: sharedRules
  }
];
