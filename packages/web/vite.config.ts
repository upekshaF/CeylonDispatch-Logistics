import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Resend blocks browser-origin (CORS) requests, so the app calls
    // /resend-api/* and the dev server forwards it to https://api.resend.com.
    proxy: {
      "/resend-api": {
        target: "https://api.resend.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/resend-api/, ""),
      },
    },
  },
});
