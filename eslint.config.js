import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import nPlugin from "eslint-plugin-n";

export default [
  js.configs.recommended,
  nPlugin.configs["flat/recommended"],
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Bun: "readonly",
      },
    },
    rules: {
      "prettier/prettier": "off",
      "no-console": "warn",
      "no-unused-vars": "warn",
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      "n/no-unsupported-features/node-builtins": "off",
      "n/no-process-exit": "off",
    },
  },
  {
    files: ["**/*.test.js"],
    rules: {
      "n/no-missing-import": "off",
    },
  },
  {
    files: ["eslint.config.js"],
    rules: {
      "n/no-unpublished-import": "off",
    },
  },
];
