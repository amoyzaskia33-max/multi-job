import { expect, test } from "@playwright/test";

test("halaman prompt bisa eksekusi dan menampilkan hasil", async ({ page }) => {
  await page.goto("/prompt");

  await expect(page.getByRole("heading", { name: "Jalankan Perintah" })).toBeVisible();
  await page.getByRole("button", { name: "Jalankan Sekarang" }).click();

  await expect(page.getByRole("heading", { name: "Hasil Eksekusi" })).toBeVisible();
  await expect(page.getByText("Total Job").first()).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("halaman team menampilkan struktur tim dan runtime", async ({ page }) => {
  await page.goto("/team");

  await expect(page.getByRole("heading", { name: "Tim & Flow" })).toBeVisible();
  await expect(page.getByText("Flow Kerja Aktif").first()).toBeVisible();
  await expect(page.getByText("Runtime Sistem").first()).toBeVisible();
});

test("halaman office menampilkan quick status board", async ({ page }) => {
  await page.goto("/office");

  await expect(page.getByRole("heading", { name: "Kantor Digital" })).toBeVisible();
  await expect(page.getByText("Papan Status Cepat").first()).toBeVisible();
  await expect(page.getByText("Astra Prime").first()).toBeVisible();
});

test("halaman otomasi menampilkan panel job dan approval", async ({ page }) => {
  await page.goto("/automation");

  await expect(page.getByRole("heading", { name: "Otomasi & Persetujuan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buat / Perbarui Tugas Otomatis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Antrean Persetujuan" })).toBeVisible();
});
