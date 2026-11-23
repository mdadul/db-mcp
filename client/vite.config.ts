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
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (/@tanstack/.test(id)) return "vendor-query";
          if (/react-router/.test(id)) return "vendor-router";
          if (/@base-ui|@radix-ui/.test(id)) return "vendor-ui";
          if (/lucide-react/.test(id)) return "vendor-icons";
          if (/[\\/](@codemirror|@lezer|@uiw|codemirror|style-mod|w3c-keyname|crelt)[\\/]/.test(id)) return "vendor-editor";
          if (/zod|[\\/]hono[\\/]/.test(id)) return "vendor-data";
          return "vendor";
        },
      },
    },
  },
});
