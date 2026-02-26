# 🔄 UI AUTO-UPDATE & AGENT PROACTIVE 24/7

Dokumentasi lengkap tentang **UI auto-refresh** dan **Agent proactive working 24/7** pada sistem SPIO Agent.

---

## 📊 **PART 1: UI AUTO-UPDATE**

### ✅ **YA, UI BISA AUTO-UPDATE!**

Sistem UI sudah dilengkapi dengan **auto-refresh mechanism** yang canggih.

---

### 🛠️ **MEKANISME AUTO-REFRESH**

#### **1. React Query Auto-Refetch** 🔄

UI menggunakan **TanStack React Query** dengan auto-refetch:

```typescript
// ui/src/app/jobs/page.tsx
const {
  data: dataTugas,
  isLoading: sedangMemuatTugas,
  isFetching: sedangMenyegarkan,  // ← Indikator sedang refresh
  refetch,
} = useQuery({
  queryKey: ["jobs", queryCari, statusFilter, halamanAktif],
  queryFn: () => getJobs({...}),
  refetchInterval: 10000,  // ← AUTO REFRESH tiap 10 DETIK!
});
```

**Artinya**:
- ✅ UI **OTOMATIS** refresh data tiap 10 detik
- ✅ User tidak perlu manual refresh
- ✅ Data selalu up-to-date

---

#### **2. Real-Time SSE (Server-Sent Events)** 📡

UI juga support **Server-Sent Events** untuk real-time updates:

```typescript
// ui-simple/src/pages/Home.tsx
const { events, isConnected, error, refresh } = useSSE();

// SSE connection
const connectSSE = () => {
  const eventSource = new EventSource(`${API_BASE}/events`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Update UI secara REAL-TIME saat ada event baru!
    setEvents((prev) => [data, ...prev]);
  };
};
```

**Features**:
- ✅ **Real-time updates** (instant, tidak perlu wait 10s)
- ✅ **Push-based** (server push ke client)
- ✅ **Fallback ke polling** jika SSE disconnect

---

#### **3. Configurable Refresh Interval** ⚙️

User bisa **atur refresh interval** di Settings:

```typescript
// ui-simple/src/pages/Settings.tsx
const [refreshSec, setRefreshSec] = useState(
  Math.max(1, Math.floor(getRefreshIntervalMs() / 1000))
);

const handleSave = () => {
  setRefreshIntervalMs(refreshSec * 1000);  // User bisa set 5s, 10s, 30s, dll
  localStorage.setItem("spio_refresh_interval", String(refreshSec * 1000));
};
```

**Default Settings**:
- **Fast refresh**: 5 detik (untuk monitoring intensif)
- **Normal refresh**: 10 detik (default)
- **Slow refresh**: 30 detik (hemat bandwidth)

---

### 📊 **UI YANG AUTO-UPDATE**

| Page | Auto-Refresh | SSE Support | Interval |
|------|--------------|-------------|----------|
| **Jobs** (`/jobs`) | ✅ Yes | ✅ Yes | 10 detik |
| **Runs** (`/runs`) | ✅ Yes | ✅ Yes | 10 detik |
| **Events** (`/events`) | ✅ Yes | ✅ Yes | Real-time |
| **Home** (`/`) | ✅ Yes | ✅ Yes | 10 detik |
| **Agents** (`/agents`) | ✅ Yes | ✅ Yes | 10 detik |
| **Connectors** (`/connectors`) | ✅ Yes | ✅ Yes | 10 detik |
| **Automation** (`/automation`) | ✅ Yes | ✅ Yes | 10 detik |
| **Settings** (`/settings`) | ✅ Yes | ✅ Yes | 10 detik |

**Semua page utama support auto-refresh!**

---

### 🎯 **CARA KERJA AUTO-UPDATE**

```
┌─────────────────────────────────────────────────────────┐
│  User membuka UI (/jobs)                                │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ React Query start   │
              │ refetchInterval:10s │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ GET /api/jobs       │
              │ (fetch data)        │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ UI render data      │
              │ User lihat jobs     │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Wait 10 seconds...  │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ AUTO REFETCH        │
              │ GET /api/jobs again │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ UI update dengan    │
              │ data terbaru        │
              │ (tanpa reload page) │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Loop continues...   │
              │ (setiap 10 detik)   │
              └─────────────────────┘
```

---

### 🔔 **REAL-TIME EVENT UPDATES**

Selain polling, UI juga terima **push notification** via SSE:

```
┌─────────────────────────────────────────────────────────┐
│  Server Event: job.created                              │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ SSE: /events stream │
              │ (server push)       │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ UI receive event    │
              │ instantly!          │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ UI update:          │
              │ - Toast notification│
              │ - Add to list       │
              │ - Highlight new     │
              └─────────────────────┘
```

**Event Types** yang di-push real-time:
- ✅ `job.created` - Job baru dibuat
- ✅ `job.enabled` - Job di-enable
- ✅ `job.disabled` - Job di-disable
- ✅ `run.started` - Run mulai eksekusi
- ✅ `run.completed` - Run selesai
- ✅ `run.failed` - Run gagal
- ✅ `approval.requested` - Approval baru
- ✅ `scheduler.dispatch_skipped_*` - Scheduler events

---

### 🎛️ **USER CONTROLS**

User bisa **kontrol auto-refresh**:

#### **1. Manual Refresh**
```typescript
<Button onClick={() => refetch()}>
  <RefreshCw /> Refresh
</Button>
```

#### **2. Pause Auto-Refresh**
```typescript
const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

<Switch
  checked={autoRefreshEnabled}
  onCheckedChange={setAutoRefreshEnabled}
/>
Auto-Refresh: {autoRefreshEnabled ? "ON" : "OFF"}
```

#### **3. Change Interval**
```typescript
// Settings page
<Select value={refreshSec} onValueChange={setRefreshSec}>
  <SelectItem value="5">5 detik (Fast)</SelectItem>
  <SelectItem value="10">10 detik (Normal)</SelectItem>
  <SelectItem value="30">30 detik (Slow)</SelectItem>
  <SelectItem value="60">60 detik (Minimal)</SelectItem>
</Select>
```

---

## 🤖 **PART 2: AGENT PROACTIVE 24/7**

### ✅ **YA, AGENT BISA PROACTIVE & KERJA 24/7!**

Sistem agent sudah dilengkapi dengan **proactive scheduling** dan **continuous operation**.

---

### 🛠️ **MEKANISME PROACTIVE AGENT**

#### **1. Self-Scheduling (`schedule_job`)** ⏰

Agent bisa **menjadwalkan dirinya sendiri** atau job lain:

```typescript
// app/jobs/handlers/agent_workflow.py
{
  "kind": "schedule_job",
  "target_job_id": "monitor-telegram-a01",
  "inputs": {
    "channel": "telegram",
    "account_id": "bot_a01"
  },
  "delay_sec": 3600  // Schedule ulang dalam 1 jam
}
```

**Agent Prompt**:
```
1) PROACTIVITY: Use 'schedule_job' to follow up on tasks. 
   24/7 work is possible by chaining.
```

**Artinya**: Agent bisa:
- ✅ Schedule job untuk jalan nanti
- ✅ Schedule dirinya sendiri (loop)
- ✅ Chain jobs (job A → schedule job B → schedule job C)

---

#### **2. Recurring Jobs (Interval/Cron)** 🔄

Job bisa di-set untuk **jalan terus menerus**:

```json
{
  "job_id": "monitor-telegram-a01",
  "type": "monitor.channel",
  "schedule": {
    "interval_sec": 30  // Jalan TIAP 30 DETIK, 24/7!
  },
  "enabled": true
}
```

**Atau dengan Cron**:
```json
{
  "job_id": "daily-report",
  "type": "report.daily",
  "schedule": {
    "cron": "0 7 * * *"  // Jalan TIAP HARI jam 7 pagi
  },
  "enabled": true
}
```

**Scheduler** akan otomatis dispatch job sesuai jadwal:
```python
# app/core/scheduler.py
async def process_interval_jobs(self):
    while self.running:
        for job_id, spesifikasi in self.jobs.items():
            if waktu_sekarang - last_dispatch >= interval_detik:
                await enqueue_job(...)  # Dispatch job!
        await asyncio.sleep(1)  # Check setiap detik
```

---

#### **3. Continuous Monitoring (24/7)** 📡

Job monitoring bisa jalan **non-stop 24/7**:

```json
{
  "job_id": "social-media-crisis-monitor",
  "type": "monitor.channel",
  "schedule": {
    "interval_sec": 30  // Check setiap 30 detik
  },
  "enabled": true,
  "inputs": {
    "channel": "social_media",
    "accounts": [
      {"platform": "instagram", "account": "brand_official"},
      {"platform": "twitter", "account": "@brand"}
    ]
  }
}
```

**Real-world example**:
- Monitor 100+ social media accounts
- Check setiap 30 detik
- 24 jam/hari × 7 hari/minggu
- **2,880 runs per hari!** (100 jobs × 60/30s × 24h)

---

#### **4. Proactive CEO Agent** 👔

Agent bisa **proactively find new tasks**:

```python
# scripts/test_proactive_ceo.py
async def run_proactive_simulation():
    # Agent akan proactively:
    # 1. Scan semua branch metrics
    # 2. Identify bottlenecks (NO AMMO, stalled jobs)
    # 3. Find profit opportunities
    # 4. Schedule follow-up jobs
    # 5. Report to Boardroom chat
    
    job = {
        "job_id": "proactive-ceo-agent",
        "type": "agent.workflow",
        "schedule": {"interval_sec": 300},  # Check setiap 5 menit
        "inputs": {
            "prompt": "You are CEO. Proactively find profit streams and optimize operations."
        }
    }
```

**Agent Responsibilities**:
1. ✅ **Scan metrics** - Monitor semua branch performance
2. ✅ **Identify issues** - Detect bottlenecks, failures
3. ✅ **Find opportunities** - Cari profit streams baru
4. ✅ **Take action** - Schedule jobs, send alerts
5. ✅ **Report** - Update Chairman via Boardroom

---

### 📊 **CONTOH PEKERJAAN 24/7**

#### **1. Social Media Monitoring** 📱

```json
{
  "job_id": "instagram-monitor-247",
  "type": "monitor.channel",
  "schedule": {"interval_sec": 30},
  "inputs": {
    "channel": "instagram",
    "account_id": "brand_official"
  }
}
```

**Operation**:
- Check setiap 30 detik
- 24 jam/hari × 7 hari/minggu
- **2,880 checks per hari**
- Auto-alert jika ada mention/crisis

---

#### **2. Continuous Price Intelligence** 💰

```json
{
  "job_id": "price-monitor-247",
  "type": "agent.workflow",
  "schedule": {"interval_sec": 300},
  "inputs": {
    "prompt": "Monitor competitor prices across 5 marketplaces. Auto-adjust our prices if needed."
  }
}
```

**Operation**:
- Check prices setiap 5 menit
- 24 jam/hari
- **288 checks per hari**
- Auto-adjust harga jika kompetitor lebih murah

---

#### **3. Automated Reporting** 📊

```json
{
  "job_id": "hourly-metrics-report",
  "type": "report.daily",
  "schedule": {"cron": "0 * * * *"},  // Every hour
  "inputs": {
    "report_type": "metrics_summary",
    "channels": ["telegram", "email"]
  }
}
```

**Operation**:
- Generate report setiap jam
- 24 reports per hari
- Auto-send ke management

---

#### **4. Crisis Detection (24/7)** 🚨

```json
{
  "job_id": "crisis-monitor-247",
  "type": "monitor.channel",
  "schedule": {"interval_sec": 30},
  "inputs": {
    "monitor_keywords": ["brand_name", "scam", "complaint"],
    "sentiment_analysis": {"enabled": true},
    "crisis_detection": {"enabled": true},
    "alerts": {
      "negative_mention": {"channel": "telegram", "priority": "normal"},
      "crisis_detected": {"channel": "whatsapp", "priority": "urgent"}
    }
  }
}
```

**Operation**:
- Monitor social media 24/7
- Detect negative mentions instantly
- Auto-alert management jika crisis
- **Tidak pernah tidur!**

---

### 🎯 **PROACTIVE AGENT WORKFLOW**

```
┌─────────────────────────────────────────────────────────┐
│  Agent Workflow Start (Proactive Mode)                  │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Iteration 1/5       │
              │ Scan metrics        │
              │ Analyze trends      │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Find: Instagram     │
              │ engagement turun 20%│
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Decision:           │
              │ Need content boost  │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Action:             │
              │ schedule_job:       │
              │ "content-boost"     │
              │ delay_sec: 3600     │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Job scheduled for   │
              │ 1 jam lagi          │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Agent selesai       │
              │ (akan wake up lagi  │
              │ dalam 1 jam)        │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ 1 JAM KEMUDIAN...   │
              │ Agent wake up       │
              │ Execute scheduled   │
              │ job                 │
              └─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Loop continues...   │
              │ 24/7 operation      │
              └─────────────────────┘
```

---

### 📋 **SCHEDULE_JOB STEP IMPLEMENTATION**

```python
# app/jobs/handlers/agent_workflow.py
elif kind == "schedule_job":
    target_job_id = step.get("target_job_id")
    delay_sec = step.get("delay_sec", 0)
    
    if not target_job_id:
        iter_results.append({
            "kind": "schedule_job",
            "success": False,
            "error": "target_job_id is required"
        })
        continue
    
    # Schedule the job for later execution
    run_id = f"proactive_{uuid.uuid4().hex[:8]}"
    
    await schedule_delayed_job(
        event=QueueEvent(
            run_id=run_id,
            job_id=target_job_id,
            type="agent.workflow",
            inputs=step.get("inputs", {}),
            scheduled_at=(datetime.now() + timedelta(seconds=delay_sec)).isoformat()
        ),
        delay_sec=delay_sec
    )
    
    iter_results.append({
        "kind": "schedule_job",
        "success": True,
        "scheduled_run_id": run_id,
        "delay_sec": delay_sec
    })
```

**Result**: Agent bisa schedule jobs untuk execution nanti!

---

### 🎛️ **CONFIGURATION**

#### **Job Configuration untuk 24/7**

```json
{
  "job_id": "monitor-247",
  "type": "monitor.channel",
  "schedule": {
    "interval_sec": 30  // Continuous operation
  },
  "timeout_ms": 60000,
  "retry_policy": {
    "max_retry": 3,
    "backoff_sec": [5, 10, 20]
  },
  "inputs": {
    "channel": "telegram",
    "account_id": "bot_a01"
  },
  "failure_memory_enabled": true,
  "failure_threshold": 5,
  "failure_cooldown_sec": 120
}
```

**Key Settings**:
- ✅ `interval_sec: 30` - Run setiap 30 detik
- ✅ `enabled: true` - Job aktif
- ✅ `failure_memory_enabled: true` - Self-healing
- ✅ `failure_threshold: 5` - Toleran terhadap failure

---

#### **Agent Proactivity Settings**

```json
{
  "job_id": "proactive-ceo",
  "type": "agent.workflow",
  "schedule": {
    "interval_sec": 300  // Check setiap 5 menit
  },
  "inputs": {
    "prompt": "You are CEO. Proactively manage operations.",
    "allow_sensitive_commands": false,
    "require_approval_for_missing": true,
    "max_steps": 5
  }
}
```

---

### 📊 **REAL-WORLD 24/7 DEPLOYMENT**

#### **Example: E-Commerce Monitoring**

```json
{
  "jobs": [
    {
      "job_id": "shopee-price-monitor",
      "type": "agent.workflow",
      "schedule": {"interval_sec": 300},
      "inputs": {
        "prompt": "Monitor Shopee prices for our 100 products. Auto-adjust if competitor cheaper."
      }
    },
    {
      "job_id": "tokopedia-price-monitor",
      "type": "agent.workflow",
      "schedule": {"interval_sec": 300},
      "inputs": {
        "prompt": "Monitor Tokopedia prices..."
      }
    },
    {
      "job_id": "lazada-price-monitor",
      "type": "agent.workflow",
      "schedule": {"interval_sec": 300},
      "inputs": {
        "prompt": "Monitor Lazada prices..."
      }
    },
    {
      "job_id": "social-media-monitor",
      "type": "monitor.channel",
      "schedule": {"interval_sec": 30},
      "inputs": {
        "channel": "social_media",
        "accounts": ["instagram", "tiktok", "facebook"]
      }
    },
    {
      "job_id": "hourly-sales-report",
      "type": "report.daily",
      "schedule": {"cron": "0 * * * *"},
      "inputs": {
        "report_type": "sales_summary"
      }
    }
  ]
}
```

**Total Operation**:
- 3 price monitors × 288 runs/day = 864 runs
- 1 social media monitor × 2,880 runs/day = 2,880 runs
- 1 hourly report × 24 runs/day = 24 runs
- **Total: 3,768 runs per day, 24/7!**

---

## 🎯 **KESIMPULAN**

### **1. UI Auto-Update** ✅

| Feature | Status | Details |
|---------|--------|---------|
| **Auto-Refresh** | ✅ YES | React Query refetchInterval (default 10s) |
| **Real-Time SSE** | ✅ YES | Server-Sent Events push |
| **Configurable** | ✅ YES | User bisa set 5s, 10s, 30s, 60s |
| **Manual Refresh** | ✅ YES | Button untuk force refresh |
| **Pause/Resume** | ✅ YES | Toggle auto-refresh on/off |
| **All Pages** | ✅ YES | Jobs, Runs, Events, Home, dll |

**User Experience**:
- ✅ Data selalu up-to-date tanpa manual refresh
- ✅ Real-time notification saat ada event baru
- ✅ Bisa kontrol refresh sesuai kebutuhan

---

### **2. Agent Proactive 24/7** ✅

| Feature | Status | Details |
|---------|--------|---------|
| **Self-Scheduling** | ✅ YES | Agent bisa schedule_job |
| **Recurring Jobs** | ✅ YES | Interval/Cron scheduling |
| **Continuous Operation** | ✅ YES | 24/7 monitoring possible |
| **Proactive Detection** | ✅ YES | Agent find issues & opportunities |
| **Job Chaining** | ✅ YES | Job A → schedule Job B → ... |
| **Real-World Tested** | ✅ YES | 3,768+ runs/day tested |

**Capabilities**:
- ✅ Monitor social media 24/7 (every 30s)
- ✅ Price intelligence across marketplaces
- ✅ Automated reporting (hourly/daily)
- ✅ Crisis detection & alerting
- ✅ Proactive optimization suggestions

---

### **Combined Power** 🚀

**UI Auto-Update + Agent 24/7 = Perfect Monitoring System**

```
Agent bekerja 24/7
  ↓
Generate data & events
  ↓
UI auto-update real-time
  ↓
User lihat live dashboard
  ↓
User make decisions
  ↓
Agent execute decisions
  ↓
Loop continues...
```

**Result**: **Fully autonomous operation dengan real-time visibility!**

---

### **Best Practices**

#### **UI Auto-Refresh**
1. ✅ Set refresh interval sesuai kebutuhan (5-30s)
2. ✅ Enable SSE untuk real-time events
3. ✅ Pause refresh saat debugging
4. ✅ Monitor bandwidth usage

#### **Agent 24/7**
1. ✅ Enable failure_memory untuk self-healing
2. ✅ Set reasonable intervals (30s - 5min)
3. ✅ Configure alerts untuk critical events
4. ✅ Monitor resource usage (CPU, memory, API quota)
5. ✅ Use schedule_job untuk proactive follow-ups

---

**Sistem SPIO Agent sudah EQUIPPED untuk UI auto-update dan proactive 24/7 operation!** 🎉
