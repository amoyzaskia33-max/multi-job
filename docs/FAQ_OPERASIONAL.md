# FAQ Operasional Sistem

## 1) Kalau sistem terlihat normal, apa indikator minimalnya?

- `/healthz` dan `/readyz` = 200
- Queue depth stabil (tidak naik terus)
- Run success naik dan failed rendah
- CI terbaru hijau

## 2) Kapan harus menjalankan `Load Simulation`?

Jalankan saat:
1. Ada perubahan di scheduler/worker/queue.
2. Ada tuning concurrency/pressure guard.
3. Sebelum milestone rilis besar.

## 3) Kapan cukup `UI E2E` saja?

Jika perubahan hanya di UI minor dan tidak menyentuh jalur eksekusi job backend.

## 4) Kenapa run banyak `queued`?

Penyebab umum:
1. Worker tidak jalan.
2. Concurrency terlalu kecil.
3. Queue tidak terkonsumsi karena error runtime.

Langkah cek:
1. Cek process worker.
2. Cek `runtime-logs/worker.err.log`.
3. Cek `/queue` dan `/runs`.

## 5) Apa beda `legacy queue mode` vs `fallback memory mode`?

- `legacy queue mode`: tetap pakai Redis (list queue) saat Streams tidak tersedia.
- `fallback memory mode`: simpan antrean di memory proses saat Redis tidak bisa dipakai.

Untuk kerja berat multi-process, lebih aman gunakan Redis modern (Streams).

## 6) Kalau CI merah, urutan debug paling aman apa?

1. Baca error pertama yang paling informatif.
2. Reproduce lokal dengan command yang sama.
3. Patch minimal.
4. Jalankan test lokal.
5. Push dan lihat CI ulang.

## 7) Apa yang wajib hijau sebelum rilis?

1. `pytest -q`
2. `npm run build`
3. `npm run e2e`
4. `npm audit --audit-level=high`
5. Workflow `UI E2E`

Opsional tapi disarankan:
6. `Load Simulation`

## 8) Kalau ada insiden P0/P1, apa prioritasnya?

1. Pulihkan layanan dulu (health endpoint normal).
2. Stabilkan antrean.
3. Kurangi blast radius (batasi job baru jika perlu).
4. Setelah stabil, lakukan root cause fix permanen.

## 9) Kapan perlu rollback?

Rollback jika:
1. Dampak produksi signifikan dan fix belum pasti.
2. Error rate naik tajam setelah deploy.
3. Queue runaway dan sistem tidak pulih dengan mitigasi cepat.

## 10) Di mana lokasi dokumen utama?

- Handbook utama: `docs/BUKU_PANDUAN_SISTEM.md`
- Checklist harian: `docs/CHECKLIST_OPERASIONAL_HARIAN.md`
- Template insiden: `docs/TEMPLATE_INSIDEN_POSTMORTEM.md`

## 11) Playwright `spawn EPERM` di Windows, apa solusinya?

Gunakan helper UI E2E yang memakai Chrome sistem:

- CMD: `e2e-local.cmd`
- PowerShell: `.\e2e-local.ps1`

Helper akan mengaktifkan `E2E_USE_SYSTEM_CHROME=1` supaya Playwright tidak perlu
download browser dan menghindari error izin spawn.

## 12) `npm audit` gagal karena registry/cache, apa yang harus dilakukan?

Jalankan ulang dengan cache lokal:

```bash
cmd /c "set npm_config_cache=%cd%\.npm-cache&& npm audit --audit-level=high"
```

PowerShell:
```powershell
$env:npm_config_cache = "$pwd\.npm-cache"
npm audit --audit-level=high
```

Jika akses registry diblokir, jalankan audit dari jaringan yang bisa akses registry
atau andalkan audit CI.
