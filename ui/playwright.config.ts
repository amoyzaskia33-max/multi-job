import { defineConfig, devices } from "@playwright/test";

const uiUrl = process.env.E2E_UI_BASE_URL || "http://127.0.0.1:5174";
const apiUrl = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";
const apiHealthUrl = `${apiUrl}/healthz`;
const isWindows = process.platform === "win32";
const pythonExecutable = isWindows ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
const apiCommand = `${pythonExecutable} -m uvicorn app.services.api.main:app --host 127.0.0.1 --port 8000`;
const uiCommand = isWindows
  ? "cmd /c npm run build && npx next start -H 127.0.0.1 -p 5174"
  : "npm run build && npx next start -H 127.0.0.1 -p 5174";

export default defineConfig({
  testDir: "./e2e",
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
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
      command: apiCommand,
      cwd: "..",
      url: apiHealthUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: uiCommand,
      cwd: ".",
      url: uiUrl,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE: apiUrl,
      },
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
