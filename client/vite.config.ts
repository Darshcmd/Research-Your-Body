import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites below /<repository-name>/.
  // The workflow supplies this value; local builds retain the normal root path.
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
