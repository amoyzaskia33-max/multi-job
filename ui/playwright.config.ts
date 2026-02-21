import { defineConfig, devices } from "@playwright/test";

const uiUrl = process.env.E2E_UI_BASE_URL || "http://127.0.0.1:5174";
const apiUrl = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";
const apiHealthUrl = `${apiUrl}/healthz`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL: uiUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: ".venv\\Scripts\\python.exe -m uvicorn app.services.api.main:app --host 127.0.0.1 --port 8000",
      cwd: "..",
      url: apiHealthUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "cmd /c npm run build && npx next start -H 127.0.0.1 -p 5174",
      cwd: ".",
      url: uiUrl,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
