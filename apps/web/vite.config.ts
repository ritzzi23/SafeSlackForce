import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  // Server-side proxy setting only; never expose backend credentials to the browser.
  const backendUrl =
    process.env.BACKEND_URL ||
    loadEnv(mode, root, "BACKEND_URL").BACKEND_URL ||
    "http://127.0.0.1:4100";
  const target = new URL(backendUrl);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "BACKEND_URL must be an HTTP(S) origin without credentials, a path, or query parameters.",
    );
  }
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@incidentos/contracts": fileURLToPath(
          new URL("../../packages/contracts/src/index.ts", import.meta.url),
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target: target.origin, changeOrigin: true },
        "/health": { target: target.origin, changeOrigin: true },
      },
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
});
