module.exports = {
  'roots': [
    '<rootDir>/test',
  ],
  testMatch: ['**/*.spec.ts'],
  'transform': {
    '^.+\\.tsx?$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.test.json',
    },
  },
};
