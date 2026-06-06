import { defineConfig } from "vite";

// Havok ships a .wasm that must be served. Excluding it from dep-optimization
// lets Vite resolve the wasm URL correctly in dev and build.
export default defineConfig({
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  server: { port: 5173 },
});
