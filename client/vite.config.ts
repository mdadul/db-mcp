import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@server": resolve(__dirname, "../src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:4080",
      "/mcp": "http://localhost:4080",
    },
  },
  build: {
    outDir: "dist",
  },
});
