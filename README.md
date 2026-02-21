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
This opens 5 windows (API, worker, scheduler, connector, UI).  
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
- `GET /jobs/{job_id}/memory` - Get failure memory (consecutive failures + cooldown)
- `GET /jobs` - List all jobs
- `GET /connector/telegram/accounts` - List Telegram connector accounts
- `GET /connector/telegram/accounts/{account_id}` - Get Telegram connector account detail
- `PUT /connector/telegram/accounts/{account_id}` - Create/update Telegram connector account
- `DELETE /connector/telegram/accounts/{account_id}` - Delete Telegram connector account
- `GET /integrations/mcp/servers` - List MCP server configs
- `GET /integrations/mcp/servers/{server_id}` - Get MCP server config detail
- `PUT /integrations/mcp/servers/{server_id}` - Create/update MCP server config
- `DELETE /integrations/mcp/servers/{server_id}` - Delete MCP server config
- `GET /integrations/accounts` - List generic integration accounts (optional `?provider=...`)
- `GET /integrations/accounts/{provider}/{account_id}` - Get integration account detail
- `PUT /integrations/accounts/{provider}/{account_id}` - Create/update integration account
- `DELETE /integrations/accounts/{provider}/{account_id}` - Delete integration account
- `GET /integrations/catalog` - List connector templates (providers + MCP)
- `POST /integrations/catalog/bootstrap` - Add connector templates to dashboard storage
- `GET /automation/agent-workflows` - List recurring `agent.workflow` jobs
- `POST /automation/agent-workflow` - Create/update recurring `agent.workflow` job
- `GET /approvals` - List approval queue (`pending/approved/rejected`)
- `POST /approvals/{approval_id}/approve` - Approve approval request
- `POST /approvals/{approval_id}/reject` - Reject approval request

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

One-call execute helper script (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File .\planner-execute.ps1 `
  -Prompt "Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00" `
  -UseAi `
  -ForceRuleBased `
  -WaitSeconds 2
```

Telegram connector account example:
```json
{
  "bot_token": "123456789:AA...",
  "allowed_chat_ids": ["123456789", "-1001122334455"],
  "enabled": true,
  "use_ai": true,
  "force_rule_based": false,
  "run_immediately": true,
  "wait_seconds": 2,
  "timezone": "Asia/Jakarta",
  "default_channel": "telegram",
  "default_account_id": "bot_a01"
}
```

MCP server config example:
```json
{
  "enabled": true,
  "transport": "stdio",
  "description": "MCP GitHub server",
  "command": "npx @modelcontextprotocol/server-github",
  "args": [],
  "url": "",
  "headers": {},
  "env": {
    "GITHUB_TOKEN": "ghp_xxx"
  },
  "auth_token": "",
  "timeout_sec": 20
}
```

Generic integration account example:
```json
{
  "enabled": true,
  "secret": "sk-xxx",
  "config": {
    "base_url": "https://api.openai.com/v1",
    "workspace": "ops-main"
  }
}
```

Catalog bootstrap example:
```json
{
  "provider_ids": ["openai", "github", "notion", "shopee"],
  "mcp_template_ids": ["mcp_github", "mcp_filesystem"],
  "account_id": "default",
  "overwrite": false
}
```

Telegram command bridge flow:
1. Save Telegram account from Dashboard `Setelan`.
2. (Optional) Save MCP server and integration accounts from the same `Setelan` page.
3. Keep connector service running (`python -m app.services.connector.main`).
4. Send command to bot chat, for example:
   - `/ai pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00`
   - `/ai sinkron issue github terbaru ke notion`
5. Connector will execute planner 1-call and reply execution summary to the same chat.

Agent workflow notes:
- If prompt does not match monitor/report/backup intent, planner will fallback to `agent.workflow`.
- `agent.workflow` reads enabled integration accounts + MCP servers from dashboard storage.
- Provider auth token is taken from integration account secret (`/integrations/accounts/...`).
- OpenAI planner key is resolved from:
  1) `openai/default` (or selected account in job input), then
  2) `OPENAI_API_KEY` environment variable.
- Use `Template Konektor Cepat` in Dashboard `Setelan` to auto-create provider/MCP templates
  (OpenAI, GitHub, Notion, Linear, Shopee, Tokopedia, Lazada, etc.).

Safe 100+ jobs load simulation:
```bash
python .\simulate_safe_load.py --jobs 100 --interval-sec 30 --work-ms 8000 --jitter-sec 25 --duration-sec 90 --cleanup
```
What this does:
1. Creates 100 recurring synthetic jobs (`simulation.heavy`) without external API dependency.
2. Monitors runs, queue depth, and overlap guard every few seconds.
3. Prints recommended worker count and final safety summary.
4. Disables simulation jobs at the end (`--cleanup`).

Failure memory and anti-loop safeguards:
1. Scheduler skips dispatch when approval for that job is still pending.
2. Scheduler skips dispatch while job is in failure cooldown window.
3. Failure memory is tracked per job (`consecutive_failures`, `cooldown_until`, `last_error`).
4. Configure from job inputs (optional):
   - `failure_threshold` (default `3`)
   - `failure_cooldown_sec` (default `120`)
   - `failure_cooldown_max_sec` (default `3600`)
   - `failure_memory_enabled` (default `true`)

Extreme pressure safeguards:
1. Worker runs multi-slot concurrency via `WORKER_CONCURRENCY` (default `5`).
2. Scheduler caps new dispatch per tick via `SCHEDULER_MAX_DISPATCH_PER_TICK` (default `80`).
3. Scheduler enters pressure mode when queue depth reaches `SCHEDULER_PRESSURE_DEPTH_HIGH` (default `300`).
4. Pressure mode is released when queue depth drops to `SCHEDULER_PRESSURE_DEPTH_LOW` (default `180`).
5. During pressure mode, only jobs with `inputs.pressure_priority = "critical"` are dispatched.
6. Configure per `agent.workflow` job using input `pressure_priority` (`critical|normal|low`).

Flow isolation safeguards (agar jalur agen tidak saling ganggu):
1. Set `flow_group` untuk mengelompokkan job dalam satu jalur kerja (contoh: `konten_harian`, `riset_produk`).
2. Set `flow_max_active_runs` untuk membatasi run aktif per jalur flow.
3. Scheduler akan skip dispatch jika jalur flow sudah penuh (event: `scheduler.dispatch_skipped_flow_limit`).
4. Cocok untuk skenario banyak job campur: tiap tim/jalur punya kuota sendiri.

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

Example `agent.workflow` with isolated flow lane:

```json
{
  "job_id": "campaign_konten_harian",
  "type": "agent.workflow",
  "schedule": { "interval_sec": 300 },
  "timeout_ms": 90000,
  "retry_policy": { "max_retry": 1, "backoff_sec": [2, 5] },
  "inputs": {
    "prompt": "Siapkan konten compliance harian dan kirim ke approval queue",
    "flow_group": "konten_harian",
    "flow_max_active_runs": 8,
    "pressure_priority": "normal",
    "allow_overlap": false
  }
}
```

## Starter Job Types

- `monitor.channel` - Check connector health and emit metrics
- `report.daily` - Generate daily summary report
- `backup.export` - Export job registry and run history
- `agent.workflow` - Plan and execute provider/MCP HTTP steps from a natural-language prompt
- `simulation.heavy` - Synthetic heavy-workload job for safe stress/load simulation

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
