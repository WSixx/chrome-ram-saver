/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js'],
  verbose: true,
  collectCoverage: false, // enable with --coverage flag
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'utils/**/*.js',
    'scripts/**/*.js',
    '!utils/i18n.js'
  ]
};
