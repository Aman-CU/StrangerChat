import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { webcrypto as nodeWebCrypto, randomFillSync } from "crypto";

// Ensure crypto.getRandomValues is available for Vite/nanoid in Node
if (!(globalThis as any).crypto || !(globalThis as any).crypto.getRandomValues) {
  (globalThis as any).crypto = nodeWebCrypto as any;
  if (!(globalThis as any).crypto.getRandomValues) {
    (globalThis as any).crypto.getRandomValues = function <T extends ArrayBufferView>(arr: T): T {
      randomFillSync(arr as unknown as NodeJS.ArrayBufferView);
      return arr;
    } as any;
  }
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
