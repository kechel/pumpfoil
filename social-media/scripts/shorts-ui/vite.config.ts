import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-Server proxyt an den Python-Server (launchd, Port 8765)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8765",
      "/media": "http://localhost:8765",
      "/thumb": "http://localhost:8765",
    },
  },
});
