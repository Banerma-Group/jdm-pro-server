const { FlatCompat } = require('@eslint/eslintrc');
const nPlugin = require('eslint-plugin-n');
const prettierPlugin = require('eslint-plugin-prettier');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.extends('eslint:recommended'),
  ...compat.extends('plugin:n/recommended'),
  ...compat.extends('prettier'),
  {
    plugins: { prettier: prettierPlugin, n: nPlugin },
    languageOptions: {
      ecmaVersion: 12,
      sourceType: 'module',
    },
    env: {
      es2021: true,
      node: true,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'warn',
    },
  },
];
