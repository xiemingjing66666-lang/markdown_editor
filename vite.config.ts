import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome130",
    chunkSizeWarningLimit: 1200,
  },
});
