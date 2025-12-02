/**
 * Jest Configuration
 * 
 * Configured for ES Modules and testing Express API routes.
 */

export default {
  testEnvironment: 'node',
  transform: {},
  // Remove .js from extensionsToTreatAsEsm since package.json has "type": "module"
  // Jest automatically treats .js as ESM when type: module is set
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.js', '**/src/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**',
    '!src/index.js',
    '!src/workers/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  testTimeout: 30000,
};

