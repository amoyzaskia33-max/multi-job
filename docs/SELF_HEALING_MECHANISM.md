# 🔄 SELF-HEALING MECHANISM - SPIO AGENT

Sistem SPIO Agent sudah dilengkapi dengan **self-healing mechanism** yang canggih untuk mencegah job terjebak dalam **error loop** yang sama terus-menerus.

---

## 🎯 **MASALAH YANG DIATASI**

### **Tanpa Self-Healing:**
```
Job gagal → Retry → Gagal lagi → Retry → Gagal lagi → ...
  ↓
Infinite loop
  ↓
Resource waste (CPU, memory, API quota)
  ↓
System crash
```

### **Dengan Self-Healing:**
```
Job gagal → Retry → Gagal lagi → Retry → Gagal lagi
  ↓
Threshold reached (3x failures)
  ↓
AUTO COOLDOWN ACTIVATED (2 menit)
  ↓
Job paused, system protected
  ↓
After cooldown: Exponential backoff (4min, 8min, 16min...)
  ↓
System remains stable
```

---

## 🛡️ **SELF-HEALING FEATURES**

### **1. Failure Memory** 🧠

Sistem **mengingat** setiap kegagalan job:

```python
{
    "job_id": "monitor-telegram-a01",
    "consecutive_failures": 3,
    "cooldown_until": "2026-02-26T18:15:00Z",
    "last_error": "Connection timeout to Telegram API",
    "last_failure_at": "2026-02-26T18:13:00Z",
    "last_success_at": "2026-02-26T17:00:00Z"
}
```

**Storage**: Redis (`job:failure:state:{job_id}`)

---

### **2. Automatic Cooldown** ⏰

Setelah **threshold** kegagalan tercapai, job otomatis di-cooldown:

#### **Default Configuration:**
```python
failure_threshold = 3          # Cooldown setelah 3x gagal berturut
failure_cooldown_sec = 120     # Cooldown awal: 2 menit
failure_cooldown_max_sec = 3600  # Max cooldown: 1 jam
```

#### **Exponential Backoff Formula:**
```python
level = consecutive_failures - threshold  # 0, 1, 2, 3...
cooldown = min(cooldown_max, cooldown_base * (2 ** level))

# Example progression:
Failure 3 → Cooldown: 2 minutes (120s)
Failure 4 → Cooldown: 4 minutes (240s)
Failure 5 → Cooldown: 8 minutes (480s)
Failure 6 → Cooldown: 16 minutes (960s)
Failure 7 → Cooldown: 32 minutes (1920s)
Failure 8 → Cooldown: 60 minutes (3600s) - MAX
Failure 9+ → Cooldown: 60 minutes (capped at max)
```

---

### **3. Scheduler Guard** 🚫

Scheduler **TIDAK AKAN** dispatch job yang sedang cooldown:

```python
# app/core/scheduler.py
async def _boleh_dispatch_job(self, job_id, spesifikasi):
    cooldown_remaining = await get_job_cooldown_remaining(job_id)
    if cooldown_remaining > 0:
        # SKIP DISPATCH
        await append_event(
            "scheduler.dispatch_skipped_cooldown",
            {
                "job_id": job_id,
                "remaining_sec": cooldown_remaining,
                "message": "Dispatch dilewati karena job masih cooldown setelah failure beruntun."
            }
        )
        return False
    return True
```

**Result**: Job tidak akan dijalankan sampai cooldown selesai.

---

### **4. Auto-Reset on Success** ✅

Begitu job berhasil, failure counter di-reset:

```python
if success:
    row["consecutive_failures"] = 0
    row["cooldown_until"] = None
    row["last_error"] = None
    row["last_success_at"] = now
```

**Result**: Job kembali normal, siap dijalankan.

---

## 📊 **FLOW LENGKAP SELF-HEALING**

```
┌─────────────────────────────────────────────────────────────┐
│                    Job Execution Start                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Execute Job Handler                     │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
              Success         Failure
                    │               │
                    ▼               ▼
        ┌─────────────────┐  ┌──────────────────┐
        │ Reset Counter   │  │ Increment Counter│
        │ Clear Cooldown  │  │ Save Error       │
        │ Record Success  │  │ Check Threshold  │
        └─────────────────┘  └──────────────────┘
                                    │
                            ┌───────┴───────┐
                            │               │
                    < Threshold    >= Threshold
                            │               │
                            ▼               ▼
                  ┌─────────────────┐ ┌─────────────────┐
                  │ No Cooldown     │ │ CALCULATE       │
                  │ Retry Normal    │ │ COOLDOWN        │
                  └─────────────────┘ │ (Exponential)   │
                                      └─────────────────┘
                                              │
                                              ▼
                                      ┌─────────────────┐
                                      │ SET cooldown_   │
                                      │ until timestamp │
                                      └─────────────────┘
                                              │
                                              ▼
                                      ┌─────────────────┐
                                      │ Scheduler SKIP  │
                                      │ Future Dispatch │
                                      └─────────────────┘
```

---

## 🔧 **CONFIGURATION**

### **Per-Job Configuration**

Setiap job bisa punya konfigurasi sendiri:

```json
{
  "job_id": "monitor-telegram-a01",
  "type": "monitor.channel",
  "schedule": { "interval_sec": 30 },
  "inputs": {
    "channel": "telegram",
    "account_id": "bot_a01",
    
    // Self-healing config
    "failure_memory_enabled": true,
    "failure_threshold": 3,
    "failure_cooldown_sec": 120,
    "failure_cooldown_max_sec": 3600
  }
}
```

### **Global Configuration** (Environment Variables)

```bash
# Default values for all jobs
DEFAULT_FAILURE_THRESHOLD=3
DEFAULT_FAILURE_COOLDOWN_SEC=120
DEFAULT_FAILURE_COOLDOWN_MAX_SEC=3600
```

---

## 📈 **CONFIGURATION PRESETS**

### **1. Critical Jobs** (High Availability Required)
```json
{
  "failure_memory_enabled": true,
  "failure_threshold": 5,        // Lebih toleran
  "failure_cooldown_sec": 60,    // Cooldown pendek
  "failure_cooldown_max_sec": 1800  // Max 30 menit
}
```

**Use Case**: Payment processing, critical monitoring

---

### **2. Standard Jobs** (Default)
```json
{
  "failure_memory_enabled": true,
  "failure_threshold": 3,        // Balanced
  "failure_cooldown_sec": 120,   // 2 menit
  "failure_cooldown_max_sec": 3600  // Max 1 jam
}
```

**Use Case**: Regular monitoring, reporting

---

### **3. Fragile Jobs** (Prone to Failures)
```json
{
  "failure_memory_enabled": true,
  "failure_threshold": 2,        // Lebih sensitif
  "failure_cooldown_sec": 300,   // 5 menit
  "failure_cooldown_max_sec": 7200  // Max 2 jam
}
```

**Use Case**: External APIs yang tidak stabil

---

### **4. Batch Jobs** (Long-Running)
```json
{
  "failure_memory_enabled": true,
  "failure_threshold": 1,        // Langsung cooldown setelah 1x gagal
  "failure_cooldown_sec": 600,   // 10 menit
  "failure_cooldown_max_sec": 14400  // Max 4 jam
}
```

**Use Case**: Data sync, large reports

---

## 🔍 **MONITORING & API**

### **Check Failure Memory**

```bash
GET /jobs/{job_id}/memory
```

**Response**:
```json
{
  "job_id": "monitor-telegram-a01",
  "consecutive_failures": 3,
  "cooldown_until": "2026-02-26T18:15:00Z",
  "cooldown_remaining_sec": 95,
  "last_error": "Connection timeout to Telegram API",
  "last_failure_at": "2026-02-26T18:13:00Z",
  "last_success_at": "2026-02-26T17:00:00Z",
  "recent_failures": [
    {
      "run_id": "run_123",
      "error": "Connection timeout",
      "timestamp": "2026-02-26T18:13:00Z"
    },
    {
      "run_id": "run_122",
      "error": "Connection timeout",
      "timestamp": "2026-02-26T18:12:30Z"
    },
    {
      "run_id": "run_121",
      "error": "Connection timeout",
      "timestamp": "2026-02-26T18:12:00Z"
    }
  ]
}
```

---

### **Clear Failure Memory** (Manual Reset)

```bash
POST /jobs/{job_id}/memory/reset
```

**Use Case**: Setelah fix bug, manual reset untuk re-enable job.

---

## 🧪 **TESTING**

### **Unit Tests**

File: `tests/test_queue_fallback_mode.py`

```python
def test_failure_memory_sets_and_clears_cooldown_in_fallback():
    # Fail 3x to trigger cooldown
    for i in range(3):
        await record_job_outcome(
            job_id="job_fail_1",
            success=False,
            error="Test error",
            failure_threshold=3,
            failure_cooldown_sec=60,
            failure_cooldown_max_sec=300,
        )
    
    # Verify cooldown active
    state = await get_job_failure_state("job_fail_1")
    assert state["consecutive_failures"] == 3
    assert state["cooldown_until"] is not None
    assert await get_job_cooldown_remaining("job_fail_1") > 0
    
    # Success resets counter
    await record_job_outcome("job_fail_1", success=True)
    state_after = await get_job_failure_state("job_fail_1")
    assert state_after["consecutive_failures"] == 0
    assert state_after["cooldown_until"] is None
```

---

### **Integration Tests**

File: `tests/test_scheduler_guard.py`

```python
def test_scheduler_skips_dispatch_when_job_in_cooldown():
    # Setup job with active cooldown
    sched.jobs = {"job_cooldown": _job_spec_interval("job_cooldown")}
    
    # Mock cooldown remaining = 60 seconds
    async def _cooldown(job_id):
        return 60
    
    monkeypatch.setattr(scheduler_module, "get_job_cooldown_remaining", _cooldown)
    
    # Attempt dispatch
    await sched.process_interval_jobs()
    
    # Verify skipped
    events = await get_events(limit=10)
    assert any(
        name == "scheduler.dispatch_skipped_cooldown" 
        for name, _ in events
    )
```

---

## 📊 **REAL-WORLD SCENARIOS**

### **Scenario 1: API Downtime**

```
Time: 10:00:00 - Job starts (interval: 30s)
Time: 10:00:30 - Run #1 FAILED (Telegram API down)
Time: 10:01:00 - Run #2 FAILED
Time: 10:01:30 - Run #3 FAILED → THRESHOLD REACHED (3)
                  → COOLDOWN ACTIVATED (2 min)
Time: 10:02:00 - Scheduler SKIP (cooldown active)
Time: 10:02:30 - Scheduler SKIP (cooldown active)
Time: 10:03:30 - Cooldown EXPIRED
Time: 10:04:00 - Run #4 FAILED → Cooldown 4 min (exponential)
Time: 10:08:00 - Run #5 FAILED → Cooldown 8 min
Time: 10:16:00 - Run #6 SUCCESS → Counter RESET
Time: 10:16:30 - Normal operation RESUMED
```

---

### **Scenario 2: Intermittent Failures**

```
Time: 09:00:00 - Run #1 SUCCESS
Time: 09:00:30 - Run #2 FAILED (network glitch)
Time: 09:01:00 - Run #3 SUCCESS → Counter RESET
Time: 09:01:30 - Run #4 SUCCESS
Time: 09:02:00 - Run #5 FAILED (another glitch)
Time: 09:02:30 - Run #6 SUCCESS → Counter RESET
```

**Result**: No cooldown triggered (failures not consecutive)

---

### **Scenario 3: Chronic Issues**

```
Job dengan bug di code:
Run #1-3: FAILED → Cooldown 2 min
Run #4: FAILED → Cooldown 4 min
Run #5: FAILED → Cooldown 8 min
Run #6: FAILED → Cooldown 16 min
Run #7: FAILED → Cooldown 32 min
Run #8: FAILED → Cooldown 60 min (MAX)
Run #9+: FAILED → Cooldown 60 min (capped)
```

**Action Required**: Manual intervention (fix bug + reset memory)

---

## 🎛️ **UI DASHBOARD**

### **Automation Page** (`/automation`)

**Failure Memory Settings**:
- ✅ Toggle: Enable/Disable failure memory
- 📊 Input: Failure threshold (1-20)
- ⏱️ Input: Initial cooldown (10s - 24h)
- ⏱️ Input: Max cooldown (10s - 7 days)

**Templates**:
- **Monitoring**: Threshold 3, Cooldown 2min/1hr
- **Reporting**: Threshold 2, Cooldown 5min/2hr
- **Integration**: Threshold 5, Cooldown 1min/30min

---

## ⚠️ **BEST PRACTICES**

### **1. Enable Always**
```json
"failure_memory_enabled": true  // ALWAYS true untuk production
```

### **2. Tune Threshold**
- **Stable APIs**: Threshold 3-5
- **Unstable APIs**: Threshold 2-3
- **Critical Jobs**: Threshold 5-10

### **3. Reasonable Cooldown**
- **Short tasks** (< 1 min): Cooldown 1-2 min
- **Medium tasks** (1-10 min): Cooldown 5-10 min
- **Long tasks** (> 10 min): Cooldown 15-30 min

### **4. Monitor Failure Patterns**
```bash
# Check jobs with high failure rate
GET /runs?status=failed&limit=100

# Check specific job failure history
GET /jobs/{job_id}/runs?status=failed
```

### **5. Alert on Cooldown**
Setup alert saat job masuk cooldown:
```python
if event_type == "scheduler.dispatch_skipped_cooldown":
    send_alert(f"Job {job_id} entered cooldown mode!")
```

---

## 🚨 **TROUBLESHOOTING**

### **Job Stuck in Cooldown**

**Symptoms**:
- Job tidak dijalankan sama sekali
- `/jobs/{job_id}/memory` shows `cooldown_remaining_sec` besar

**Solutions**:
1. **Wait**: Biarkan cooldown expire
2. **Fix Root Cause**: Cek `last_error`, fix masalah
3. **Manual Reset**:
   ```bash
   POST /jobs/{job_id}/memory/reset
   ```

---

### **Cooldown Terlalu Sering**

**Symptoms**:
- Job sering masuk cooldown
- Threshold terlalu rendah

**Solutions**:
1. **Increase Threshold**:
   ```json
   "failure_threshold": 5  // dari 3
   ```
2. **Shorten Cooldown**:
   ```json
   "failure_cooldown_sec": 60  // dari 120
   ```
3. **Fix Job Logic**: Cek error pattern, perbaiki handler

---

### **Failure Memory Tidak Work**

**Symptoms**:
- Counter tidak increment
- Cooldown tidak aktif

**Check**:
1. `failure_memory_enabled` harus `true`
2. Redis harus accessible
3. Cek logs untuk error di `_record_failure_memory`

---

## 📊 **METRICS & ALERTING**

### **Key Metrics**

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Jobs in Cooldown | 0-5% | 5-15% | >15% |
| Avg Consecutive Failures | < 2 | 2-5 | > 5 |
| Cooldown Reset Rate | > 80% | 50-80% | < 50% |

### **Alert Rules**

```python
# Alert: Job masuk cooldown
IF event_type == "scheduler.dispatch_skipped_cooldown"
THEN alert("Job {job_id} entered cooldown")

# Alert: High failure rate
IF (failed_runs / total_runs) > 0.1 in last 1 hour
THEN alert("High failure rate detected")

# Alert: Chronic cooldown
IF job in cooldown > 3 times in 1 hour
THEN alert("Chronic cooldown for {job_id}")
```

---

## ✅ **KESIMPULAN**

### **Self-Healing Features:**
1. ✅ **Failure Memory** - Track consecutive failures
2. ✅ **Automatic Cooldown** - Exponential backoff
3. ✅ **Scheduler Guard** - Skip dispatch during cooldown
4. ✅ **Auto-Reset** - Reset on success
5. ✅ **Configurable** - Per-job tuning
6. ✅ **Observable** - API & dashboard monitoring

### **Benefits:**
- 🛡️ **Prevents Infinite Loops** - No more retry storms
- 💾 **Resource Protection** - Save CPU, memory, API quota
- 📈 **System Stability** - Isolate problematic jobs
- 🔍 **Easy Debugging** - Clear failure history
- ⚡ **Auto-Recovery** - Resume when issues resolved

### **Production Ready:**
- ✅ Tested (unit + integration tests)
- ✅ Documented (API + dashboard)
- ✅ Configurable (per-job settings)
- ✅ Observable (metrics + alerts)

---

**Sistem SPIO Agent SUDAH PUNYA self-healing mechanism yang PRODUCTION READY!** 🎉
