const baseRules = require("eslint-config-lydell");

module.exports = {
  env: {
    commonjs: true,
    es6: true,
    browser: true,
  },
  plugins: [
    "prettier"
  ],
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: Object.assign({}, baseRules(), {
    "prettier/prettier": "error",
  }),
};
