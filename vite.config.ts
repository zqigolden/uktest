import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" + hash routing keeps the build deployable under any path
// (github.io/<repo>/ included) with no server-side routing.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
