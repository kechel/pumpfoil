import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-Server auf 8090 (passt zur Apache-Reverse-Proxy-Config). Im Dev wird /api
// an den lokal laufenden FastAPI-Server (Port 8000) weitergereicht.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8090,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
