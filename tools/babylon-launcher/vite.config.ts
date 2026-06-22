import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  server: {
    port: 3100,
    strictPort: true,
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: [
      "@babylonjs/gui-editor",
      "@babylonjs/node-editor",
      "@babylonjs/node-geometry-editor",
      "@babylonjs/node-particle-editor",
      "@babylonjs/node-render-graph-editor",
    ],
  },
});
