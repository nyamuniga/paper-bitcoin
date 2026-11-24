import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  envPrefix: ["VITE_", "BREEZ_", "BREEZE_"],
  optimizeDeps: {
    exclude: ["@breeztech/breez-sdk-spark"],
  },

  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          if (id.includes("/react-router")) {
            return "vendor-router";
          }
          if (id.includes("/framer-motion/") || id.includes("/motion-dom/") || id.includes("/motion-utils/")) {
            return "vendor-motion";
          }
          if (id.includes("/@cashu/") || id.includes("/@noble/") || id.includes("/@scure/")) {
            return "vendor-crypto";
          }
          if (id.includes("/nostr-tools/")) {
            return "vendor-nostr";
          }
          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }
          if (id.includes("/crypto-js/")) {
            return "vendor-cryptojs";
          }
          if (id.includes("/@breeztech/")) {
            return undefined;
          }
          if (id.includes("/@yudiel/")) {
            return undefined;
          }
          return undefined;
        },
      },
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
