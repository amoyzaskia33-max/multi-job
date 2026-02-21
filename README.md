# Multi-Job Platform

A scalable job processing platform built with Python and Redis.

## Architecture

The platform consists of four main services:

1. **API Service** - FastAPI for CRUD operations, health checks, and metrics
2. **Scheduler Service** - Manages scheduled jobs (interval/cron)
3. **Worker Service** - Executes jobs from the queue
4. **Connector Service** - Manages external connections (Telegram, WhatsApp, etc.)

## Key Features

- **Job Scheduling**: Interval-based and cron scheduling
- **Retry Logic**: Configurable retry policies with exponential backoff
- **Tool System**: Reusable tools (HTTP, KV, Messaging, Files, Metrics)
- **Observability**: Structured logging, metrics, and health endpoints
- **Redis-Based Queue**: Uses Redis Streams for job queuing and ZSET for delayed jobs

## Project Structure

```
multi_job/
├── app/
│   ├── core/               # Core components
│   │   ├── config.py       # Configuration
│   │   ├── redis_client.py # Redis client
│   │   ├── models.py       # Pydantic models
│   │   ├── queue.py        # Queue system (Streams + ZSET)
│   │   ├── runner.py       # Job execution pipeline
│   │   ├── registry.py     # Job type -> handler mapping
│   │   ├── observability.py # Logger + metrics + tracing
│   │   ├── policies.py     # Tool allowlist/denylist
│   │   ├── tools/          # Tool implementations
│   │   └── connectors/     # Connector implementations
│   ├── jobs/
│   │   ├── specs/          # Job specifications (JSON/YAML)
│   │   └── handlers/       # Job logic handlers
│   └── services/
│       ├── api/            # API service (FastAPI)
│       ├── worker/         # Worker service
│       ├── scheduler/      # Scheduler service
│       └── connector/      # Connector service
├── tests/                  # Test files
├── docker-compose.yml      # Docker configuration
├── pyproject.toml          # Dependency management
└── README.md               # This file
```

## Getting Started

1. Start Redis:
   ```bash
   docker-compose up -d redis
   ```

2. Install dependencies:
   ```bash
   pip install -e .
   ```

3. Run services:
   - API: `python -m uvicorn app.services.api.main:app --host 127.0.0.1 --port 8000`
   - Worker: `python -m app.services.worker.main`
   - Scheduler: `python -m app.services.scheduler.main`
   - Connector: `python -m app.services.connector.main`

4. Run Next.js frontend:
   ```bash
   cd ui
   npm install
   npm run build
   npm run serve
   ```
   UI URL: `http://127.0.0.1:3000`

Quick Windows launcher:
```bat
start-local.cmd
```
This opens 4 windows (API, worker, scheduler, UI).  
To stop:
```bat
stop-local.cmd
```

Alternative launcher with health check + PID/log tracking (recommended):
```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```
Check status:
```powershell
powershell -ExecutionPolicy Bypass -File .\status-local.ps1
```
Stop all:
```powershell
powershell -ExecutionPolicy Bypass -File .\stop-local.ps1
```
Logs are stored in:
```text
.\runtime-logs
```

## API Endpoints

- `GET /healthz` - Health check
- `GET /readyz` - Readiness check
- `GET /metrics` - Prometheus metrics
- `POST /planner/plan` - Convert prompt into structured job plan
- `POST /planner/plan-ai` - Prompt planner with smolagents (auto fallback to rule-based)
- `POST /planner/execute` - Prompt to plan + create/update jobs + enqueue runs in one call
- `POST /jobs` - Create new job
- `GET /jobs/{job_id}` - Get job specification
- `PUT /jobs/{job_id}/enable` - Enable job
- `PUT /jobs/{job_id}/disable` - Disable job
- `GET /jobs/{job_id}/runs` - Get recent runs for a job
- `GET /jobs` - List all jobs

Planner request example:
```json
{
  "prompt": "Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00",
  "timezone": "Asia/Jakarta"
}
```

Planner AI request example:
```json
{
  "prompt": "Pantau whatsapp akun ops_01 tiap 45 detik dan buat laporan harian jam 08:00",
  "timezone": "Asia/Jakarta",
  "model_id": "openai/gpt-4o-mini",
  "force_rule_based": false
}
```

Optional setup for planner AI (`/planner/plan-ai`):
```bash
pip install smolagents litellm
```
Set environment variables:
```bash
set OPENAI_API_KEY=your_key_here
set PLANNER_AI_MODEL=openai/gpt-4o-mini
```

One-call execute example:
```json
{
  "prompt": "Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00",
  "use_ai": true,
  "force_rule_based": true,
  "run_immediately": true,
  "wait_seconds": 2
}
```

## Job Specification Example

```json
{
  "job_id": "monitor-telegram-a01",
  "type": "monitor.channel",
  "schedule": { "interval_sec": 30 },
  "timeout_ms": 15000,
  "retry_policy": { "max_retry": 5, "backoff_sec": [1,2,5,10,30] },
  "inputs": { "channel": "telegram", "account_id": "bot_a01" }
}
```

## Starter Job Types

- `monitor.channel` - Check connector health and emit metrics
- `report.daily` - Generate daily summary report
- `backup.export` - Export job registry and run history

## Tool System

Each job can use predefined tools:
- `http`: Make HTTP requests
- `kv`: Key-value storage in Redis
- `messaging`: Send messages (Telegram, WhatsApp)
- `files`: Read/write files
- `metrics`: Emit metrics and logs

Tool access is controlled by policies per job type.

## Observability

- Structured JSON logs with job_id, run_id, trace_id
- Prometheus metrics endpoint
- Health endpoints for monitoring
- Redis-based heartbeat monitoring
