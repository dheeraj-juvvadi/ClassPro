import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	{
		rules: {
			"react/no-unescaped-entities": "off",
			"@next/next/no-page-custom-font": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"no-console": "warn",
			"react-hooks/refs": "off",
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/immutability": "off",
			"react-hooks/purity": "off",
			"react-hooks/preserve-manual-memoization": "off",
		},
	},
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",

		// Project-specific ignores:
		"public/sw.js",
		"public/sw.js.map",
		"public/workbox-*.js",
		"public/workbox-*.js.map",
	]),
]);

export default eslintConfig;
