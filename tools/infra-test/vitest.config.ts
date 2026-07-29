import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.spec.ts"],
    environment: "node",
    testTimeout: 20_000,
    reporters: ["default"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});