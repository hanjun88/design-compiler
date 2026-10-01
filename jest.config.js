/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // These are ts-node entrypoint scripts (run via `ts-node tests/runner.test.ts`
  // and `ts-node ... tests/demo/e2e-demo.test.ts`); they drive their assertions
  // at import time with node:assert and contain no jest `test()` cases, so jest
  // must not try to execute them as suites.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/runner.test.ts',
    '<rootDir>/tests/demo/e2e-demo.test.ts'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'compiler-core/**/*.ts',
    '!compiler-core/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  verbose: true
};
