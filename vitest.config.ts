import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/migration/**",
        "src/seed.ts",
        "src/seed-assets/**",
        "src/index.ts",
        "src/create-user.ts",
        "src/data-source.ts",
      ],
    },
  },
});
