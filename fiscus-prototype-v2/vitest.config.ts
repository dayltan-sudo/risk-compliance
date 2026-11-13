import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: "engine", include: ["src/**/*.test.ts"] } },
      { extends: true, test: { name: "ui", include: ["src/**/*.test.tsx"] } },
      {
        extends: true,
        test: {
          name: "server",
          include: ["server/**/*.test.ts"],
          setupFiles: ["server/__tests__/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
