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
        // Browser & Web APIs
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        Image: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",

        // WebExtensions / Chrome API
        chrome: "readonly",

        // RAM Saver custom globals
        I18n: "readonly",

        // Node.js & CommonJS (scripts, configs, tests)
        module: "readonly",
        exports: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",

        // Jest test runner
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly"
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
