import { defineConfig } from "vite";

// Relative assets work at / and at /any-repository-name/ on GitHub Pages.
export default defineConfig({
  base: "./",
  server: {
    watch: {
      ignored: [
        "**/release/**",
        "**/research/local-history/**",
        "**/research/pret/**",
        "**/research/mgba-source/**",
        "**/research/captures/**",
      ],
    },
  },
});
