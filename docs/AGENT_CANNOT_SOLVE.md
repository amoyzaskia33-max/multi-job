# 🤔 HANDLING AGENT YANG TIDAK MENEMUKAN SOLUSI

Dokumentasi lengkap tentang bagaimana sistem SPIO Agent menangani situasi ketika **agent tidak bisa menemukan solusi** atau **stuck dalam problem**.

---

## 🎯 **SKENARIO AGENT TIDAK BISA SOLVE**

### **1. Agent Mencapai Max Iterations** ⚠️

Sistem membatasi agent pada **5 iterasi maksimum**:

```python
iterasi_maks = 5
iterasi_sekarang = 0

while iterasi_sekarang < iterasi_maks:
    iterasi_sekarang += 1
    # Agent planning & execution
    
    if final_message_ditemukan:
        break  # Task completed
    
    if not rencana_terakhir.get("steps"):
        break  # Agent cannot proceed
```

**Apa yang terjadi**:
- Iterasi 1: Agent mencoba solve
- Iterasi 2: Agent retry dengan approach berbeda
- Iterasi 3: Agent analyze failure patterns
- Iterasi 4: Agent try alternative methods
- Iterasi 5: **LAST ATTEMPT** - Agent harus provide final_message

**Setelah 5 iterasi**:
```
IF agent masih tidak bisa solve:
  → Agent WAJIB provide final_message
  → final_message menjelaskan MENGAPA tidak bisa solve
  → Job selesai dengan status "completed" (bukan failed)
```

---

### **2. Agent Tidak Bisa Proceed (No Steps)** 🛑

Jika agent return **steps kosong**:

```json
{
  "thought": "I cannot proceed because...",
  "summary": "Task cannot be completed",
  "final_message": "Cannot solve because: [reason]",
  "steps": []  // EMPTY = agent stuck
}
```

**Sistem akan**:
1. ✅ Break loop (stop iteration)
2. ✅ Record final_message
3. ✅ Mark job as completed
4. ✅ Save learning ke agent memory

---

### **3. Agent Error/Exception** 💥

Jika planner **error saat generate plan**:

```python
try:
    rencana_raw = await _panggil_planner_openai(...)
except Exception as exc:
    if not hasil_langkah_akumulasi:
        # FIRST iteration failure = CRITICAL
        return {
            "success": False,
            "error": f"Agent planner gagal: {exc}",
            "memory_context": updated_memory
        }
    else:
        # Some progress made = partial success
        final_message_ditemukan = f"Planner error pada iterasi {iterasi_sekarang}: {exc}"
        break
```

**Handling**:
- **Iterasi 1 error** → Job FAILED, return error detail
- **Iterasi 2-5 error** → Continue dengan partial results

---

## 🛡️ **SAFETY MECHANISMS**

### **1. Memory-Based Avoidance** 🧠

Agent **TIDAK BOLEH** mengulang pattern yang sudah gagal:

```python
# Agent memory context
{
    "avoid_signatures": [
        "HTTP GET /api/data → 404 Not Found",
        "python scripts/process.py → FileNotFoundError",
        "POST /webhook → Connection timeout"
    ],
    "recent_failures": [
        {
            "signature": "HTTP GET → 404",
            "error": "Resource not found",
            "lesson": "Check endpoint exists before calling"
        }
    ]
}
```

**Prompt ke Agent**:
```
CRITICAL: DO NOT repeat these failed patterns (avoid_signatures):
  - HTTP GET /api/data → 404 Not Found
  - python scripts/process.py → FileNotFoundError

Lessons learned from recent failures:
  - Pattern 'HTTP GET → 404' failed with: Resource not found
    Lesson: Check endpoint exists before calling
```

**Result**: Agent dipaksa cari approach BERBEDA, tidak stuck di loop yang sama.

---

### **2. Iteration Counter** 🔢

Agent **TAHU** dia di iterasi berapa:

```
You are at iteration 3/5. If you cannot solve it now, 
provide a final_message explaining why.
```

**Effect**:
- Iterasi 1-2: Agent bisa explore
- Iterasi 3-4: Agent harus make progress
- Iterasi 5: Agent HARUS conclude (success atau failure)

---

### **3. Final Message Requirement** 📝

Agent **WAJIB** isi `final_message` jika:
- Task sudah selesai
- **ATAU** tidak bisa proceed lebih lanjut

**Schema**:
```json
{
  "thought": "My reasoning...",
  "summary": "What I planned...",
  "final_message": "Task completed! OR Cannot solve because...",
  "steps": [...] or []
}
```

**Cannot Solve Example**:
```json
{
  "thought": "I tried 3 different approaches but all failed because the API is down",
  "summary": "Attempted to fetch data from 3 endpoints, all returned 503",
  "final_message": "Cannot complete task: Target API (api.example.com) is returning 503 Service Unavailable. Tried endpoints: /data, /v2/data, /health. Recommendation: Wait for API to recover or contact service provider.",
  "steps": []
}
```

---

## 📊 **FLOW LENGKAP**

```
┌─────────────────────────────────────────────────────────┐
│  Agent Workflow Start                                   │
│  Prompt: "Analyze sales data and generate report"       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Iteration 1/5       │
              │ - Plan steps        │
              │ - Execute           │
              └─────────────────────┘
                        │
                ┌───────┴───────┐
                │               │
            Success         Failure
                │               │
                ▼               ▼
        ┌──────────────┐  ┌──────────────────┐
        │ Continue to  │  │ Record failure   │
        │ next iter    │  │ in memory        │
        └──────────────┘  │ Add to avoid_    │
                          │ signatures       │
                          └──────────────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ Iteration 2/5    │
                        │ Try DIFFERENT    │
                        │ approach (cannot │
                        │ repeat failed    │
                        │ patterns)        │
                        └──────────────────┘
                                  │
                          ┌───────┴───────┐
                          │               │
                      Success         Failure
                          │               │
                          ▼               ▼
                  ┌─────────────┐  ┌──────────────┐
                  │ Continue    │  │ Record +     │
                  │             │  │ Retry (3/5)  │
                  └─────────────┘  └──────────────┘
                                          │
                                          ▼
                                  ┌──────────────┐
                                  │ Iteration 3/5│
                                  │ ...          │
                                  └──────────────┘
                                          │
                                          ▼
                                  ┌──────────────┐
                                  │ Iteration 4/5│
                                  │ ...          │
                                  └──────────────┘
                                          │
                                          ▼
                                  ┌──────────────┐
                                  │ Iteration 5/5│
                                  │ LAST CHANCE  │
                                  └──────────────┘
                                          │
                                  ┌───────┴───────┐
                                  │               │
                              Solved      Cannot Solve
                                  │               │
                                  ▼               ▼
                          ┌─────────────┐  ┌──────────────┐
                          │ final_msg:  │  │ final_msg:   │
                          │ "Task done" │  │ "Cannot      │
                          │ ✅ SUCCESS  │  │ solve        │
                          └─────────────┘  │ because..."  │
                                           │ ⚠️ EXPLANATION
                                           └──────────────┘
                                                   │
                                                   ▼
                                           ┌──────────────┐
                                           │ Job Complete │
                                           │ Status saved │
                                           │ Memory saved │
                                           └──────────────┘
```

---

## 🔍 **CONTOH SCENARIO NYATA**

### **Scenario 1: API Down** 🔴

**Prompt**: "Fetch sales data from Shopify API"

```
Iteration 1/5:
  Steps: [HTTP GET https://api.shopify.com/sales]
  Result: FAILED - 503 Service Unavailable
  Memory: avoid_signatures += ["GET shopify → 503"]

Iteration 2/5:
  Steps: [HTTP GET https://api.shopify.com/v2/sales]
  Result: FAILED - 503 Service Unavailable
  Memory: avoid_signatures += ["GET shopify/v2 → 503"]

Iteration 3/5:
  Steps: [HTTP GET https://api.shopify.com/health]
  Result: FAILED - 503 Service Unavailable
  Memory: avoid_signatures += ["GET shopify/health → 503"]

Iteration 4/5:
  Steps: [HTTP POST https://api.shopify.com/sales]
  Result: FAILED - 503 Service Unavailable
  Memory: avoid_signatures += ["POST shopify → 503"]

Iteration 5/5 (LAST):
  Agent realizes: ALL Shopify endpoints are down
  Steps: []
  final_message: "Cannot complete task: Shopify API is completely down (503 errors on all endpoints). 
                  Tried: GET /sales, GET /v2/sales, GET /health, POST /sales.
                  Recommendation: Wait 1-2 hours for API recovery or contact Shopify support."
  
Result: Job completed with explanation
```

---

### **Scenario 2: Missing Credentials** 🔐

**Prompt**: "Post content to Instagram"

```
Iteration 1/5:
  Steps: [provider_http: Instagram POST /media]
  Result: FAILED - No Instagram account configured
  Approval Request: Need Instagram account credentials

System: Waiting for user to add credentials...
User: Does not add credentials

Iteration 2/5:
  Steps: [provider_http: Instagram POST /media]
  Result: FAILED - Still no account

Iteration 3/5:
  Agent realizes: Cannot proceed without credentials
  Steps: []
  final_message: "Cannot complete task: Instagram account not configured. 
                  Required: Instagram Business account with valid access token.
                  Action needed: Go to Settings > Integrations > Add Instagram account."

Result: Job completed with clear action item
```

---

### **Scenario 3: Impossible Task** 🚫

**Prompt**: "Hack into competitor's database and steal their customer list"

```
Iteration 1/5:
  Agent analysis: This is ILLEGAL and UNETHICAL
  Steps: []
  final_message: "I cannot and will not perform this task. Reason:
                  1. Hacking is illegal (violates Computer Crime laws)
                  2. Stealing data is unethical (violates privacy)
                  3. This would harm the company's reputation
                  
                  Alternative legal approaches:
                  - Analyze competitor's PUBLIC website
                  - Use legal market research tools
                  - Study their public marketing campaigns"

Result: Job completed with ethical refusal
```

---

### **Scenario 4: Technical Limitation** ⚙️

**Prompt**: "Generate 1000 unique product images in 1 minute"

```
Iteration 1/5:
  Steps: [multimedia: generate_image x 1000]
  Result: FAILED - Timeout (would take 50 minutes)

Iteration 2/5:
  Steps: [multimedia: generate_image x 100 (batch)]
  Result: PARTIAL - Generated 100 images in 5 minutes

Iteration 3/5:
  Agent calculates: 1000 images @ 3s each = 50 minutes
  Steps: []
  final_message: "Cannot complete task within time constraint.
                  Technical limitation: Image generation takes ~3 seconds per image.
                  1000 images × 3s = 3000s = 50 minutes (not 1 minute).
                  
                  What I accomplished:
                  - Generated 100 sample images (attached)
                  - Created template for bulk generation
                  
                  Recommendations:
                  1. Run overnight (start job at 2 AM)
                  2. Use external image generation service
                  3. Reduce requirement to 20 images/minute"

Result: Job completed with partial success + recommendations
```

---

## 📋 **RESPONSE TYPES**

### **1. Success with Final Message** ✅

```json
{
  "success": true,
  "agent_key": "agent_sales_report",
  "summary": "Generated sales report from 3 platforms",
  "final_message": "Task completed successfully! Generated comprehensive sales report:
                    - Total revenue: Rp 500,000,000
                    - Top product: Product A (Rp 150M)
                    - Growth: +15% vs last month
                    Report saved to /reports/sales-2026-02.pdf",
  "step_results": [...],
  "memory_context": {...}
}
```

---

### **2. Cannot Solve - External Dependency** ⚠️

```json
{
  "success": false,
  "agent_key": "agent_instagram_post",
  "summary": "Attempted to post to Instagram but missing credentials",
  "final_message": "Cannot complete task: Instagram account not configured.
                    Required: Instagram Business account with valid access token.
                    
                    Steps to fix:
                    1. Go to Settings > Integrations
                    2. Click 'Add Instagram Account'
                    3. Connect your Instagram Business account
                    4. Re-run this job",
  "error": "missing_instagram_credentials",
  "memory_context": {
    "recent_failures": [
      {
        "signature": "Instagram POST → 401",
        "error": "No credentials configured",
        "lesson": "Need to add Instagram account first"
      }
    ]
  }
}
```

---

### **3. Cannot Solve - Technical Limitation** 🛑

```json
{
  "success": false,
  "agent_key": "agent_bulk_images",
  "summary": "Attempted to generate 1000 images but hit time limit",
  "final_message": "Cannot complete task: Technical limitation on image generation speed.
                    Current rate: 20 images/minute
                    Required rate: 1000 images/minute (50x faster)
                    
                    What I accomplished:
                    - Generated 20 sample images
                    - Validated template works
                    
                    Recommendations:
                    1. Use external service (Midjourney API, DALL-E)
                    2. Pre-generate images in batch overnight
                    3. Reduce requirement to realistic volume",
  "error": "technical_limitation_image_generation_speed",
  "step_results": [
    {"kind": "multimedia", "success": true, "count": 20}
  ]
}
```

---

### **4. Cannot Solve - Ethical Refusal** 🚫

```json
{
  "success": false,
  "agent_key": "agent_competitor_analysis",
  "summary": "Requested task violates ethical guidelines",
  "final_message": "I cannot perform this task because it violates ethical guidelines:
                    Task: 'Hack competitor's database'
                    
                    Reasons:
                    1. Illegal activity (computer crime)
                    2. Violates privacy laws
                    3. Would harm company reputation
                    
                    Alternative legal approaches:
                    1. Analyze competitor's PUBLIC website
                    2. Use legal market research (SimilarWeb, SEMrush)
                    3. Study their public social media presence",
  "error": "ethical_violation_refused",
  "step_results": []
}
```

---

## 🎛️ **CONFIGURATION**

### **Max Iterations**

Default: **5 iterations**

```python
# app/jobs/handlers/agent_workflow.py
MAX_STEPS = 5  # Steps per iteration
iterasi_maks = 5  # Maximum iterations
```

**Tuning**:
- **Simple tasks**: 3 iterations (faster completion)
- **Complex tasks**: 5 iterations (default, balanced)
- **Research tasks**: 7-10 iterations (more exploration)

---

### **Final Message Enforcement**

Agent **WAJIB** isi final_message di iterasi terakhir:

```python
if iterasi_sekarang >= iterasi_maks:
    # Force agent to conclude
    if not final_message_ditemukan:
        final_message_ditemukan = (
            f"Task incomplete after {iterasi_maks} iterations. "
            f"Last attempt: {summary_akumulasi[-1]}"
        )
```

---

## 📊 **METRICS & MONITORING**

### **Key Metrics**

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Max Iteration Reach Rate | < 10% | 10-30% | > 30% |
| Cannot Solve Rate | < 5% | 5-15% | > 15% |
| Ethical Refusal Rate | 0% | 0-1% | > 1% |

### **Alert Rules**

```python
# Alert: High cannot-solve rate
IF (cannot_solve_jobs / total_jobs) > 0.15 in last 1 hour
THEN alert("High agent failure rate: 15%+ jobs cannot be solved")

# Alert: Common failure pattern
IF same_error_signature appears in 10+ jobs
THEN alert("Common failure pattern detected: {signature}")
```

---

## 🔧 **TROUBLESHOOTING**

### **Agent Selalu Stuck di Iterasi 5**

**Symptoms**:
- Job selalu reach max iterations
- final_message selalu "Cannot solve"

**Root Causes**:
1. Task terlalu complex untuk 5 iterations
2. Missing dependencies (API keys, accounts)
3. Technical limitations

**Solutions**:
1. **Increase iterations**:
   ```python
   iterasi_maks = 10  # dari 5
   ```
2. **Add missing dependencies**
3. **Simplify task scope**

---

### **Agent Tidak Provide Final Message**

**Symptoms**:
- Job ends tanpa final_message
- User bingung kenapa job selesai

**Root Cause**:
- Bug di agent workflow handler

**Solution**:
```python
# Force final_message di akhir
if not final_message_ditemukan:
    final_message_ditemukan = (
        f"Task completed after {iterasi_sekarang} iterations. "
        f"Summary: {'; '.join(summary_akumulasi)}"
    )
```

---

### **Agent Mengulang Pattern yang Sama**

**Symptoms**:
- Agent retry approach yang sama berkali-kali
- avoid_signatures tidak respected

**Root Cause**:
- Memory context tidak passed correctly

**Solution**:
```python
# Ensure memory context is updated and passed
konteks_memori = await _muat_konteks_memori_terbaru()
rencana_raw = await _panggil_planner_openai(
    ...,
    agent_memory_context=konteks_memori,  # MUST include this
    ...
)
```

---

## ✅ **KESIMPULAN**

### **Agent Tidak Bisa Solve = BUKAN FAILURE**

Sistem mendesain situasi "cannot solve" sebagai **LEARNING OPPORTUNITY**:

1. ✅ **Clear Explanation** - Agent WAJIB jelaskan kenapa tidak bisa solve
2. ✅ **Actionable Recommendations** - Agent harus suggest next steps
3. ✅ **Memory Saved** - Failure patterns disimpan untuk avoid di masa depan
4. ✅ **Partial Results** - Progress yang sudah made tetap saved
5. ✅ **Graceful Degradation** - Job selesai dengan explanation, bukan crash

### **Safety Mechanisms**

| Mechanism | Purpose |
|-----------|---------|
| **Max 5 Iterations** | Prevent infinite loops |
| **Avoid Signatures** | Prevent repeating failed patterns |
| **Final Message Required** | Force conclusion & explanation |
| **Memory Persistence** | Learn from failures |
| **Approval Requests** | Ask for help when stuck |

### **Best Practices**

1. ✅ Always provide clear final_message
2. ✅ Include actionable recommendations
3. ✅ Save learnings to memory
4. ✅ Respect avoid_signatures
5. ✅ Know when to stop (max iterations)

---

**Sistem SPIO Agent sudah EQUIPPED untuk handle situasi agent tidak bisa solve dengan GRACEFUL dan INFORMATIVE!** 🎉
