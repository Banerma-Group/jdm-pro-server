const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = (async () => {
  const nPlugin = (await import('eslint-plugin-n')).default;

  return [
    js.configs.recommended,
    nPlugin.configs['flat/recommended'],
    prettierConfig,
    {
      plugins: {
        prettier: prettierPlugin,
      },
      languageOptions: {
        ecmaVersion: 2021,
        sourceType: 'commonjs',
      },
      rules: {
        'prettier/prettier': 'error',
        'no-console': 'warn',
        'no-unused-vars': 'warn',
      },
    },
    {
      files: ['eslint.config.js'],
      rules: {
        'n/no-unpublished-import': 'off',
        'n/no-unpublished-require': 'off',
      },
    },
  ];
})();
