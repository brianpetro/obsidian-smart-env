import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import obsidian_md from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        jsDocParsingMode: "all",
      },
    },
  },
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/main.js",
    "**/*.min.js",
    "**/coverage/**",
    "**/eslint.config.*",
    "**/eslint.base.*",
    "**/esbuild.js",
    "**/release.js",
    "**/*.test.js",
    "**/test/**",
    "**/tests/**",
    "**/migrations/**",
    "**/releases/**",
    "**/package.json",
    "**/♻️/**",
  ]),
  ...obsidian_md.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: [
            "Smart Environment",
            "Smart Env",
            "Smart Lookup",
            "Smart Loop",
            "Pro plugins",
            "Smart Connections",
            "Smart Context",
            "Smart Chat",
            "Smart Graph"
          ],
          acronyms: ["OK"],
          enforceCamelCaseLower: false,
        },
      ],
    },
  },
]);