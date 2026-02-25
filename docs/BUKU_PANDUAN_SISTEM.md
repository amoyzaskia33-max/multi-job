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

