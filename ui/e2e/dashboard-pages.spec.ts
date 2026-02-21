import { expect, test } from "@playwright/test";

test("halaman prompt bisa eksekusi dan menampilkan hasil", async ({ page }) => {
  await page.goto("/prompt");

  await expect(page.getByRole("heading", { name: "Prompt Eksekusi" })).toBeVisible();
  await page.getByRole("button", { name: "Eksekusi Prompt" }).click();

  await expect(page.getByRole("heading", { name: "Hasil Prompt" })).toBeVisible();
  await expect(page.getByText("Jumlah Tugas")).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("halaman team menampilkan struktur tim dan runtime", async ({ page }) => {
  await page.goto("/team");

  await expect(page.getByRole("heading", { name: "Team Structure" })).toBeVisible();
  await expect(page.getByText("CEO Agent (You + Orchestrator)")).toBeVisible();
  await expect(page.getByText("Live Runtime Agents")).toBeVisible();
});

test("halaman office menampilkan quick status board", async ({ page }) => {
  await page.goto("/office");

  await expect(page.getByRole("heading", { name: "Digital Office" })).toBeVisible();
  await expect(page.getByText("Quick Status Board")).toBeVisible();
  await expect(page.getByText("Astra Prime")).toBeVisible();
});
