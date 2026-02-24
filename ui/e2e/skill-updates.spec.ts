import { expect, request as playwrightRequest, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";

test("menampilkan update skill baru dari event backend di halaman setelan", async ({ page }) => {
  const accountId = `e2e_${Date.now()}`;
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });

  try {
    const upsertResponse = await api.put(`/integrations/accounts/openai/${accountId}`, {
      data: {
        enabled: true,
        secret: "sk-e2e-test",
        config: { model_id: "gpt-4o-mini" },
      },
    });
    expect(upsertResponse.ok()).toBeTruthy();

    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Pembaruan Skill & Puzzle Terbaru" })).toBeVisible();
    await expect(page.getByText(new RegExp(`Akun integrasi openai/${accountId} diperbarui\\.`))).toBeVisible();
  } finally {
    await api.delete(`/integrations/accounts/openai/${accountId}`);
    await api.dispose();
  }
});
