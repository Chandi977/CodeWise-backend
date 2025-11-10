module.exports = {
  root: true,
  parser: '@typescript-eslint/parser', // ✅ TypeScript-aware parser
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json', // ✅ Link ESLint to TypeScript config
    tsconfigRootDir: __dirname,
  },
  plugins: [
    '@typescript-eslint',
    'prettier', // optional but recommended
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended', // ✅ Core TS lint rules
    'plugin:prettier/recommended', // ✅ Integrates Prettier with ESLint
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'tests/', '*.js'], // ✅ Avoid compiled files
  env: {
    node: true,
    es2020: true,
    jest: true,
  },
  rules: {
    // General best practices
    'prettier/prettier': 'warn',
    'no-console': 'off',

    // TypeScript rules
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
