import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.FRONTEND_PORT ? Number(process.env.FRONTEND_PORT) : 5290,
    proxy: {
      "/api": "http://localhost:3020",
    },
  },
});
