module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: "google",
  overrides: [],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    quotes: ["error", "double", { avoidEscape: true }],
    "require-jsdoc": [
      "error",
      { require: { ClassDeclaration: true, FunctionDeclaration: false } },
    ],
    "max-len": [
      "error",
      { code: 80, ignoreComments: true, ignoreStrings: true, ignoreTemplateLiterals: true },
    ],
    "object-curly-spacing": ["error", "always"],
    "quote-props": ["error", "as-needed"],
    "comma-dangle": [
      "error",
      { arrays: "always-multiline", objects: "always-multiline" },
    ],
    indent: "off",
  },
};
