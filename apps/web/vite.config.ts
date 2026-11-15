import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: { proxy: { "/api": process.env.API_URL ?? "http://localhost:3000" } },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon-32.png", "apple-touch-icon.png"],
      manifest: {
        name: "CoPeroCo",
        short_name: "CoPeroCo",
        description: "Apps para compañeros de piso y amigos: compra, gastos, favores y viajes",
        theme_color: "#0136a3",
        background_color: "#e4f0fd",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // los logos también se guardan para que la app (local-first) se vea igual sin conexión
        globPatterns: ["**/*.{js,css,html,png,ico,webmanifest}"],
      },
    }),
  ],
});
