import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  server: {
    middlewareMode: true,
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
