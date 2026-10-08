/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
	darkMode: "class", // allows toggling dark mode manually
	theme: {
		extend: {
			fontFamily: {
				serif: [
					"Noto Serif SC",
					"Source Han Serif SC",
					"Source Han Serif CN",
					"Songti SC",
					"SimSun",
					"STSong",
					"Playfair Display",
					"Georgia",
					...defaultTheme.fontFamily.serif,
				],
				sans: [
					"Noto Serif SC",
					"Source Han Serif SC",
					"Songti SC",
					"SimSun",
					...defaultTheme.fontFamily.sans,
				],
				mono: [
					"JetBrains Mono Variable",
					"JetBrains Mono",
					...defaultTheme.fontFamily.mono,
				],
			},
		},
	},
	plugins: [require("@tailwindcss/typography")],
};
