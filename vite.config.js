import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

export default defineConfig({
  plugins: [uni()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy: {'/api': 'http://127.0.0.1:8787'} },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
