import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
	plugins: [svelte()],
	build: {
		outDir: "public",
		emptyOutDir: false,
		rollupOptions: {
			input: "src/main.ts",
			output: {
				entryFileNames: "app.js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: (info) => {
					if (info.name?.endsWith(".css")) return "styles.css";
					return "assets/[name]-[hash][extname]";
				},
			},
		},
	},
	server: {
		port: 5174,
		proxy: {
			"/api": "http://localhost:4322",
		},
	},
});
