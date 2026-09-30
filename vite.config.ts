import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` → dist/ for any static host (GitHub Pages, Netlify, …).
// `npm run build:single` → dist-single/index.html with every asset inlined.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "node",
  },
}));
