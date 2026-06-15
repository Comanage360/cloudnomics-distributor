import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // Dev convenience: proxy /api to the backend so no CORS hassle locally.
      "/api": "http://localhost:4000",
    },
  },
});
