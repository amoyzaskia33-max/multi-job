import { expect, request as playwrightRequest, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";
const BATAS_JOBS = 20;
const BATAS_RUNS = 30;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildJobPayload = (jobId: string) => ({
  job_id: jobId,
  type: "monitor.channel",
  timeout_ms: 30000,
  retry_policy: { max_retry: 1, backoff_sec: [1] },
  inputs: {
    channel: "whatsapp",
    account_id: "default",
  },
});

test("halaman jobs mendukung pagination server-side", async ({ page }) => {
  const prefix = `e2e-paging-job-${Date.now()}`;
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  const createdJobIds: string[] = [];

  try {
    for (let i = 0; i < 21; i += 1) {
      const suffix = String(i).padStart(2, "0");
      const jobId = `${prefix}-${suffix}`;
      createdJobIds.push(jobId);
      const response = await api.post("/jobs", { data: buildJobPayload(jobId) });
      expect(response.ok()).toBeTruthy();
    }

    await expect
      .poll(async () => {
        const response = await api.get(`/jobs?search=${encodeURIComponent(prefix)}&limit=100`);
        if (!response.ok()) return -1;
        const rows = (await response.json()) as Array<{ job_id: string }>;
        return rows.length;
      })
      .toBeGreaterThanOrEqual(21);

    const expectedPage1Count = (
      (await (await api.get(`/jobs?search=${encodeURIComponent(prefix)}&limit=${BATAS_JOBS}&offset=0`)).json()) as Array<
        { job_id: string }
      >
    ).length;
    const expectedPage2Count = (
      (await (await api.get(`/jobs?search=${encodeURIComponent(prefix)}&limit=${BATAS_JOBS}&offset=${BATAS_JOBS}`)).json()) as Array<
        { job_id: string }
      >
    ).length;

    await page.goto("/jobs");
    await page.getByPlaceholder("Cari job (job_id / type)...").fill(prefix);

    await expect(page.getByRole("heading", { level: 1, name: "Daftar Tugas" })).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Halaman 1, menampilkan ${expectedPage1Count} job\\.`)),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: `${prefix}-19` })).toBeVisible();

    const tombolBerikutnya = page.getByRole("button", { name: "Berikutnya" });
    if (expectedPage2Count > 0) {
      await expect(tombolBerikutnya).toBeEnabled();
    } else {
      await expect(tombolBerikutnya).toBeDisabled();
      return;
    }
    await tombolBerikutnya.click();

    await expect(page.getByText(/^Halaman 2$/)).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Halaman 2, menampilkan ${expectedPage2Count} job\\.`)),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: `${prefix}-20` })).toBeVisible();
    await expect(page.getByRole("cell", { name: new RegExp(`^${escapeRegex(prefix)}-00$`) })).not.toBeVisible();
  } finally {
    await Promise.all(
      createdJobIds.map((jobId) =>
        api.put(`/jobs/${encodeURIComponent(jobId)}/disable`, { data: {} }).catch(() => null),
      ),
    );
    await api.dispose();
  }
});

test("halaman runs mendukung pagination server-side", async ({ page }) => {
  const jobId = `e2e-paging-run-job-${Date.now()}`;
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });

  try {
    const createJobResponse = await api.post("/jobs", { data: buildJobPayload(jobId) });
    expect(createJobResponse.ok()).toBeTruthy();

    for (let i = 0; i < 31; i += 1) {
      const runResponse = await api.post(`/jobs/${encodeURIComponent(jobId)}/run`);
      expect(runResponse.ok()).toBeTruthy();
    }

    const expectedPage1Count = (
      (await (await api.get(`/runs?job_id=${encodeURIComponent(jobId)}&limit=${BATAS_RUNS}&offset=0`)).json()) as Array<{
        run_id: string;
      }>
    ).length;
    const expectedPage2Count = (
      (
        await (await api.get(`/runs?job_id=${encodeURIComponent(jobId)}&limit=${BATAS_RUNS}&offset=${BATAS_RUNS}`)).json()
      ) as Array<{
        run_id: string;
      }>
    ).length;

    await page.goto("/runs");
    await page.getByPlaceholder("Filter job_id").fill(jobId);

    await expect(page.getByRole("heading", { level: 1, name: "Riwayat Eksekusi" })).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Halaman 1, menampilkan ${expectedPage1Count} run\\.`)),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: jobId }).first()).toBeVisible();

    const tombolBerikutnya = page.getByRole("button", { name: "Berikutnya" });
    if (expectedPage2Count > 0) {
      await expect(tombolBerikutnya).toBeEnabled();
    } else {
      await expect(tombolBerikutnya).toBeDisabled();
      return;
    }
    await tombolBerikutnya.click();

    await expect(page.getByText(/^Halaman 2$/)).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Halaman 2, menampilkan ${expectedPage2Count} run\\.`)),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(expectedPage2Count);
  } finally {
    await api.put(`/jobs/${encodeURIComponent(jobId)}/disable`, { data: {} }).catch(() => null);
    await api.dispose();
  }
});
