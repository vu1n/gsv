import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: ".",
  publicDir: "public",
  resolve: {
    alias: {
      "onnxruntime-web": fileURLToPath(new URL("./src/onnxruntime-web-cdn.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
    open: true,
  },
});
