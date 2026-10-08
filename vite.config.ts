import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), netlify(), viteReact()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }, dedupe: ["react", "react-dom", "@tanstack/react-router"] },
});
