import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        rootDir: '.',
        outDir: './dist',
        module: 'ESNext',
        moduleResolution: 'node',
        target: 'ES2022',
        esModuleInterop: true,
        strict: false,
      },
    }],
  },
};

export default config;
