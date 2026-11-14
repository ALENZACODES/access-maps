import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:5180" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --config e2e/harness/vite.config.ts",
    cwd: "..",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
