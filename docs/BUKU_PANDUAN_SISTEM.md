# Buku Panduan Sistem Multi-Job Platform

Dokumen ini adalah panduan operasional total sistem untuk tim developer, operator, dan maintainer.
Fokusnya: cara menjalankan, memonitor, menguji, dan menangani masalah pada platform secara konsisten.

## 1) Ringkasan Sistem

Platform ini adalah mesin orkestrasi job berbasis Python + Redis dengan 4 service utama:

1. API service (`FastAPI`)
2. Scheduler service
3. Worker service
4. Connector service

Frontend dashboard berjalan di Next.js (`ui/`) untuk memantau job, run, event, approval, connector, dan integrasi.

## 2) Arsitektur Inti

### 2.1 Komponen

- `app/services/api/main.py`: endpoint kontrol, observability, planner, approvals, integrasi.
- `app/core/scheduler.py`: dispatch job interval/cron + guard (overlap, pressure, flow limit, cooldown).
- `app/services/worker/main.py`: konsumsi antrean job dan eksekusi handler.
- `app/services/connector/main.py`: bridge channel seperti Telegram.
- `app/core/queue.py`: lapisan antrean, run store, event timeline, failure memory.
- `ui/`: dashboard operasional.

### 2.2 Jalur Data Singkat

1. Job dibuat/diaktifkan via API.
2. Scheduler menganalisis jadwal + guard, lalu enqueue event run.
3. Worker dequeue event, jalankan handler job, simpan hasil run.
4. API + UI membaca status job/run/event untuk observability.

## 3) Mode Antrean Redis (Penting)

Sistem mendukung 3 mode antrean:

1. `Redis Streams mode` (utama)
   - Dipakai jika Redis mendukung `XGROUP/XADD/XREADGROUP`.
   - Mode paling lengkap untuk workload berat.

2. `Legacy Redis queue mode` (kompatibilitas)
   - Otomatis aktif jika Redis tidak mendukung Streams.
   - Menggunakan `RPUSH/BLPOP` list queue.
   - Cocok untuk environment lama, tapi tetap disarankan upgrade Redis modern.

3. `In-memory fallback mode` (darurat)
   - Aktif jika Redis tidak bisa diakses.
   - Berguna untuk local/dev emergency.
   - Tidak direkomendasikan untuk workload multi-process berat.

Catatan:
- Untuk produksi/scale, targetkan Redis modern (Redis 7+).
- Fallback memory hanya untuk degradasi sementara.

## 4) Prasyarat Environment

### 4.1 Minimum toolchain

- Python 3.11
- Node.js 20+
- npm 10+
- Redis
- Git

Opsional:
- GitHub CLI (`gh`) untuk cek/trigger run Actions.

### 4.2 Dependensi project

Backend:

```bash
python -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -e .
```

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .
```

Frontend:

```bash
cd ui
npm ci
```

## 5) Menjalankan Sistem Lokal

### 5.1 Cara paling cepat (Windows)

Start:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

Cek status:

```powershell
powershell -ExecutionPolicy Bypass -File .\status-local.ps1
```

Stop:

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-local.ps1
```

Log runtime ada di folder `runtime-logs/`.

### 5.2 Menjalankan manual per service

API:

```bash
python -m uvicorn app.services.api.main:app --host 127.0.0.1 --port 8000
```

Worker:

```bash
python -m app.services.worker.main
```

Scheduler:

```bash
python -m app.services.scheduler.main
```

Connector:

```bash
python -m app.services.connector.main
```

UI:

```bash
cd ui
npm run build
npm run serve
```

Default endpoint:
- API: `http://127.0.0.1:8000`
- UI: `http://127.0.0.1:3000`

## 6) Checklist Health Sistem

Gunakan checklist ini setelah start:

1. `GET /healthz` -> `200`
2. `GET /readyz` -> `200`
3. UI terbuka normal
4. Scheduler heartbeat muncul
5. Worker heartbeat muncul
6. Bisa create job dan muncul run
7. Queue depth tidak stuck naik terus

Endpoint cepat:
- `GET /jobs`
- `GET /runs?limit=50`
- `GET /events?limit=50`
- `GET /metrics`

## 7) Operasional Harian

### 7.1 Buat dan aktifkan job

Gunakan API `POST /jobs` dengan `job_id`, `type`, `schedule`, `inputs`.

### 7.2 Pantau run

- Dashboard halaman `Runs`
- API `GET /runs`

### 7.3 Tangani approval

- `GET /approvals`
- `POST /approvals/{approval_id}/approve`
- `POST /approvals/{approval_id}/reject`

### 7.4 Tangani error berulang

Cek failure memory:
- `GET /jobs/{job_id}/memory`

Atur parameter input job:
- `failure_threshold`
- `failure_cooldown_sec`
- `failure_cooldown_max_sec`

## 8) Pengujian dan Quality Gate

### 8.1 Test lokal

Backend:

```bash
./.venv/bin/python -m pytest -q
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

UI E2E:

```bash
cd ui
npm run e2e
```

### 8.2 Security audit UI

```bash
cd ui
npm audit --audit-level=high
```

## 9) Workflow GitHub Actions

### 9.1 `UI E2E`

File: `.github/workflows/ui-e2e.yml`

Mencakup:
1. Install dependency backend
2. `pytest -q`
3. Install dependency UI
4. `npm audit --audit-level=high`
5. Playwright install
6. `npm run e2e`

Trigger:
- `push` dan `pull_request` ke `master` pada path terkait app/ui/tests/workflow.

### 9.2 `Load Simulation`

File: `.github/workflows/load-simulation.yml`

Mencakup:
1. Menyalakan Redis service di runner
2. Menjalankan API + worker + scheduler
3. Menjalankan `simulate_safe_load.py`
4. Validasi hasil load (ada success, tidak ada failed, depth aman)
5. Upload log artifact

Trigger:
- Manual (`workflow_dispatch`) dengan parameter jobs, duration, concurrency, dst.

## 10) Uji Beban Aman (Local/CI)

Contoh:

```bash
python .\simulate_safe_load.py --jobs 100 --interval-sec 30 --work-ms 8000 --jitter-sec 25 --duration-sec 60 --cleanup
```

Interpretasi cepat:
- `success` harus naik stabil
- `failed` idealnya `0`
- `queue depth` tidak runaway
- `overlap_jobs` idealnya `0` jika overlap guard aktif

## 11) Tuning untuk Kerja Berat

Parameter utama:

- `WORKER_CONCURRENCY` (default 5)
- `SCHEDULER_MAX_DISPATCH_PER_TICK` (default 80)
- `SCHEDULER_PRESSURE_DEPTH_HIGH` (default 300)
- `SCHEDULER_PRESSURE_DEPTH_LOW` (default 180)

Saran praktis:

1. Naikkan `WORKER_CONCURRENCY` bertahap (mis. 10 -> 20 -> 40).
2. Pantau queue depth dan run success ratio.
3. Aktifkan `flow_group` + `flow_max_active_runs` untuk isolasi jalur kerja.
4. Gunakan `pressure_priority=critical` hanya untuk job benar-benar penting.

## 12) Troubleshooting Cepat

### 12.1 `gh` tidak dikenali

Gejala:
- `gh : The term 'gh' is not recognized`

Solusi:
1. Pastikan GitHub CLI ter-install.
2. Restart terminal, atau pakai path penuh `C:\Program Files\GitHub CLI\gh.exe`.

### 12.2 Redis lama tidak support Streams

Gejala:
- `unknown command 'XGROUP'`

Solusi:
1. Sistem otomatis pindah ke legacy queue mode.
2. Tetap disarankan upgrade Redis ke versi modern.

### 12.3 Run stuck queued

Cek:
1. Worker process benar-benar jalan.
2. Redis reachable.
3. `runtime-logs/worker.err.log` untuk error startup.
4. Tidak ada port collision dengan proses lama.

### 12.4 UI gagal start karena port dipakai

Gejala:
- `EADDRINUSE`

Solusi:
1. Matikan proses yang pakai port (`3000` atau `5174`).
2. Jalankan ulang `stop-local.ps1` lalu `start-local.ps1`.

### 12.5 Kamus Error Cepat (Error -> Akar Masalah -> Perbaikan)

| Gejala/Error (contoh pesan) | Akar Masalah Paling Umum | Cara Perbaikan Cepat |
| --- | --- | --- |
| `gh : The term 'gh' is not recognized` | GitHub CLI belum ter-install atau PATH belum reload | Install `gh`, restart terminal, atau pakai full path `C:\\Program Files\\GitHub CLI\\gh.exe` |
| `gh auth status` belum login / token invalid | Sesi auth GitHub belum aktif | Jalankan `gh auth login`, lalu cek `gh auth status` |
| `error connecting to api.github.com` | Gangguan internet/DNS sementara | Cek koneksi, retry 1-2 menit, cek `githubstatus.com` |
| `unknown command 'XGROUP'` | Redis lama, tidak support Streams | Upgrade Redis modern (disarankan), sistem akan fallback ke legacy queue mode |
| `Process from config.webServer ... Exit code: 3` | Web server Playwright gagal start | Lihat log webServer, biasanya dependency/port issue |
| `missing required package @types/node` | Dependency TypeScript belum terpasang di UI | `cd ui && npm i -D @types/node` lalu rerun E2E |
| `EADDRINUSE: address already in use` | Port sudah dipakai proses lain | Stop proses lama (`3000/5174/8000`), lalu start ulang service |
| Run status banyak `queued` tapi tidak diproses | Worker tidak jalan, crash, atau tidak konsumsi queue | Cek `runtime-logs/worker.err.log`, cek process worker, cek Redis koneksi |
| Worker log `No handler found for job type: ...` | Tipe job tidak terdaftar di handler registry | Perbaiki `type` pada spec job atau daftarkan handler job tersebut |
| `npm audit` ada `high/critical` | Dependency rentan keamanan | Upgrade package terdampak (misal `next`) hingga audit bersih |
| `npm list next ... invalid` | Instalasi npm terputus/corrupt lockfile state | Jalankan ulang `npm install`, bila perlu `npm ci` |
| `API /healthz` gagal atau timeout | API belum start / port bentrok / error startup | Cek `runtime-logs/api.err.log`, pastikan port 8000 bebas |
| `UI E2E` merah, lokal hijau | Perbedaan env CI (timing/dependency) | Cek artifact Playwright + log run CI, perketat locator dan wait logic |
| `scheduler.dispatch_skipped_overlap` berulang | Guard overlap aktif, run lama belum selesai | Naikkan interval, optimasi job duration, atau set `allow_overlap=true` bila memang aman |
| Queue depth terus naik saat load test | Worker concurrency kurang vs beban masuk | Naikkan `WORKER_CONCURRENCY`, review `work_ms`, cek pressure settings scheduler |

### 12.6 Cara Pakai Kamus Error

1. Ambil 1 baris error paling jelas dari log (`api.err.log`, `worker.err.log`, CI log, atau UI console).
2. Cocokkan ke tabel di atas.
3. Lakukan perbaikan cepat sesuai kolom kanan.
4. Verifikasi ulang dengan:
   - `pytest -q`
   - `npm run e2e`
   - (opsional) `Load Simulation`

### 12.7 Contoh Kondisi Normal (Baseline Sehat)

| Area | Contoh Kondisi Normal | Cara Cek |
| --- | --- | --- |
| API health | `GET /healthz` dan `GET /readyz` mengembalikan `200` | `curl http://127.0.0.1:8000/healthz` |
| UI | Dashboard bisa dibuka, halaman jobs/runs/settings terbuka normal | Buka `http://127.0.0.1:3000` |
| Worker | Run bergerak dari `queued -> running -> success` | `GET /runs?limit=20` |
| Queue | `depth` kecil/stabil, tidak naik terus menerus | `GET /queue` |
| Scheduler | Event dispatch muncul periodik, tidak spam error | `GET /events?limit=50` |
| CI E2E | Workflow `UI E2E` status `completed success` | GitHub Actions / `gh run list` |
| Security UI | `npm audit` tidak ada `high/critical` | `cd ui && npm audit --audit-level=high` |

Contoh output normal cepat:

```text
/healthz => 200
/readyz  => 200
/queue   => {"depth": 0, "delayed": 0}
pytest   => 77 passed
e2e      => 7 passed
```

Contoh pola runs normal saat load:

```text
t=10s  queued=10  running=30  success=20  failed=0
t=20s  queued=5   running=20  success=60  failed=0
t=30s  queued=2   running=10  success=90  failed=0
```

Interpretasi:
1. `success` terus naik.
2. `failed` tetap `0` atau sangat kecil.
3. `queued` tidak menumpuk tanpa turun.
4. Queue depth tidak runaway.

## 13) Keamanan Operasional

1. Aktifkan Auth RBAC untuk environment non-local:
   - `AUTH_ENABLED=true`
2. Pisahkan token per role (`viewer/operator/admin`).
3. Simpan secret integration di account storage, jangan hardcode.
4. Jalankan `npm audit` dan review dependency update secara berkala.

## 14) Runbook Rilis Ringkas

Sebelum rilis:
1. `pytest -q` hijau
2. `npm run build` hijau
3. `npm run e2e` hijau
4. `npm audit --audit-level=high` bersih
5. CI `UI E2E` hijau
6. (Opsional) `Load Simulation` manual hijau

Setelah rilis:
1. Pantau `/healthz`, `/readyz`, `/metrics`
2. Pantau run failed ratio dan queue depth
3. Pantau approval backlog

## 15) Referensi File Penting

- Root ringkas: [README.md](../README.md)
- Workflow CI E2E: [ui-e2e.yml](../.github/workflows/ui-e2e.yml)
- Workflow Load test: [load-simulation.yml](../.github/workflows/load-simulation.yml)
- Script load: [simulate_safe_load.py](../simulate_safe_load.py)
