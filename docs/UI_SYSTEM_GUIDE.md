# 🎨 UI SISTEM SPIO AGENT - PANDUAN LENGKAP

Dokumentasi lengkap tentang **User Interface (UI)** sistem SPIO Agent yang modern, real-time, dan user-friendly.

---

## 📊 **OVERVIEW UI**

### **Tech Stack**
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: Radix UI + shadcn/ui
- **State Management**: TanStack React Query
- **Real-time**: Server-Sent Events (SSE)

---

## 🏛️ **STRUKTUR UI**

### **Layout Utama**

```
┌────────────────────────────────────────────────────────────┐
│  SIDEBAR (Left)          │  MAIN CONTENT (Right)          │
│  ────────────────────────│  ─────────────────────────────  │
│  [Logo & Title]          │  [Page Header]                  │
│                          │                                  │
│  Navigation:             │  [Page Content]                 │
│  • Holding Suite         │  - Cards                        │
│  • The Armory            │  - Tables                       │
│  • Branch Manager        │  - Forms                        │
│  • HoldCo Control        │  - Charts                       │
│                          │                                  │
│  [Version Footer]        │  [Auto-refresh active]          │
└────────────────────────────────────────────────────────────┘
```

---

## 📱 **PAGES & FEATURES**

### **1. Home / Holding Suite** (`/`)

**Purpose**: Dashboard utama untuk Chairman

**Features**:
- 📊 **Portfolio Metrics**
  - Total Revenue (semua branches)
  - Units Active (jumlah branches)
  - Total Closings
  
- 🏢 **Business Units Cards**
  - List semua branches
  - Revenue per branch
  - Status indicator (active/inactive)
  - "NO AMMO" warning jika tidak ada credentials

- 📈 **Branch Detail Panel** (saat pilih branch)
  - Leads, Closings, Status metrics
  - CEO Executive Briefing (AI-generated insights)
  - Pipeline visualization (Research → Promotion → Closing)

- 💬 **Executive Boardroom Chat**
  - Real-time chat dengan CEO (AI)
  - Chairman bisa kirim mandat
  - CEO laporkan progress & insights
  - Auto-scroll ke message terbaru

- 🚦 **Health Beacon Footer**
  - API status (real-time)
  - Redis memory usage
  - AI Factory status
  - System version

**Auto-Refresh**: 5 detik (metrics), 3 detik (chat)

---

### **2. Jobs** (`/jobs`)

**Purpose**: Manage semua jobs (create, edit, enable/disable, trigger)

**Features**:
- 📋 **Jobs Table**
  - Job ID, Type, Schedule
  - Status (enabled/disabled)
  - Last run, Created at
  - Actions (enable/disable, trigger, history)

- 🔍 **Search & Filter**
  - Search by job_id / type
  - Filter: All / Enabled / Disabled
  - Server-side pagination (20 jobs/page)

- 📊 **Statistics Card**
  - Total jobs
  - Active jobs
  - Interval jobs
  - Cron jobs
  - No schedule

- ⚡ **Quick Actions**
  - Enable/Disable job
  - Trigger manual run
  - View run history
  - Version rollback

- 📜 **Job Versions Panel**
  - List semua versi job spec
  - Created at, Created by
  - Rollback ke versi sebelumnya
  - View detail versi

**Auto-Refresh**: 10 detik

---

### **3. Automation** (`/automation`)

**Purpose**: Kelola agent workflows, triggers, dan approvals

**Features**:

#### **A. Agent Workflow Automations**
- 🤖 **Recurring Agent Jobs**
  - List semua agent.workflow jobs
  - Schedule (interval/cron)
  - Prompt configuration
  - Enable/Disable controls

#### **B. Triggers**
- ⚡ **Webhook Triggers**
  - Create webhook trigger
  - Generate unique webhook URL
  - Fire webhook manually (test)
  - Delete trigger

- 📅 **Scheduled Triggers**
  - Cron-based triggers
  - Fire trigger manually

#### **C. Approval Queue**
- ✅ **Pending Approvals**
  - List approval requests
  - View details (kind, reason, provider)
  - Approve / Reject actions
  - Filter: All / Pending / Approved / Rejected

#### **D. Create/Edit Automation Form**
- 📝 **Job Configuration**
  - Job ID input
  - Type selection
  - Schedule (interval/cron toggle)
  - Prompt input (for agent.workflow)
  - Advanced settings:
    - Failure memory (enable/disable)
    - Failure threshold
    - Cooldown settings
    - Flow group & limits
    - Pressure priority

**Auto-Refresh**: 10 detik

---

### **4. Runs** (`/runs`)

**Purpose**: View execution history semua jobs

**Features**:
- 📜 **Runs Table**
  - Run ID, Job ID, Status
  - Started at, Finished at
  - Duration, Attempt
  - Result (success/failed)

- 🔍 **Search & Filter**
  - Filter by job_id
  - Filter by status (queued/running/success/failed/retry)
  - Search box
  - Server-side pagination (30 runs/page)

- 📊 **Statistics**
  - Total runs
  - Success rate
  - Failed runs
  - Queued runs

- 🔎 **Run Detail Modal**
  - Full run details
  - Input data
  - Result/output
  - Error message (if failed)
  - Trace ID (for debugging)

**Auto-Refresh**: 10 detik

---

### **5. Settings** (`/settings`)

**Purpose**: Configure integrations, connectors, and system settings

**Features**:

#### **A. Integration Accounts**
- 🔌 **Provider Accounts**
  - List integrations (OpenAI, GitHub, Notion, dll)
  - Create/Update account
  - Delete account
  - View account details (masked secrets)

#### **B. MCP Servers**
- 🔧 **MCP Server Config**
  - List MCP servers
  - Create/Update server
  - Transport type (stdio/http/sse)
  - Command/URL configuration
  - Environment variables
  - Delete server

#### **C. Connector Accounts**
- 📱 **Telegram Bots**
  - List Telegram bot accounts
  - Create/Update bot (bot_token, allowed_chat_ids)
  - Delete bot
  - Test connection

#### **D. Skill Registry**
- 🎓 **Skills Management**
  - List registered skills
  - Install new skill (YAML/JSON)
  - Delete skill
  - View skill details

#### **E. System Settings**
- ⚙️ **Configuration**
  - Refresh interval settings
  - Auth configuration
  - CORS settings
  - Feature flags

**Auto-Refresh**: 10 detik

---

### **6. Armory** (`/armory`)

**Purpose**: Manage social media accounts & credentials

**Features**:
- 🔐 **Account Management**
  - List all accounts (Instagram, Facebook, TikTok, dll)
  - Account status (ready/pending/error)
  - Proxy configuration
  - Branch assignment

- ⚠️ **Security Warnings**
  - "NO AMMO" indicator (missing credentials)
  - Account lock status
  - Last verification time

- 📊 **Account Metrics**
  - Posts count
  - Engagement rate
  - Followers growth

**Auto-Refresh**: 5 detik

---

### **7. Agents** (`/agents`)

**Purpose**: Monitor agent status and performance

**Features**:
- 🤖 **Agent Pool Status**
  - List workers by pool
  - Concurrency settings
  - Heartbeat status
  - Active runs count

- 📈 **Performance Metrics**
  - Jobs completed
  - Success rate
  - Average duration
  - Error rate

**Auto-Refresh**: 10 detik

---

### **8. Connectors** (`/connectors`)

**Purpose**: Monitor connector health and status

**Features**:
- 🔌 **Connector Status**
  - List all connectors (Telegram, WhatsApp, Email, dll)
  - Health status (healthy/unhealthy)
  - Last check time
  - Error messages

- 📊 **Metrics**
  - Messages sent
  - Success rate
  - Average response time

**Auto-Refresh**: 10 detik

---

### **9. Experiments** (`/experiments`)

**Purpose**: A/B testing and experiment management

**Features**:
- 🧪 **Experiment List**
  - Experiment ID, Name
  - Status (enabled/disabled)
  - Variants (A/B)
  - Traffic split

- 📊 **Results**
  - Variant performance
  - Conversion rates
  - Statistical significance

**Auto-Refresh**: 10 detik

---

### **10. Skills** (`/skills`)

**Purpose**: Skill registry management

**Features**:
- 🎓 **Skills Table**
  - Skill ID, Name, Description
  - Job type
  - Version
  - Tags

- 📝 **Skill Editor**
  - Create/Edit skill
  - YAML/JSON editor
  - Command allowlist
  - Channel permissions
  - Default inputs

**Auto-Refresh**: 10 detik

---

### **11. Team** (`/team`)

**Purpose**: View team structure and flow groups

**Features**:
- 👥 **Flow Groups**
  - List flow groups
  - Active runs per flow
  - Flow limits

- 📊 **Runtime Stats**
  - System health
  - Resource usage
  - Queue depth

**Auto-Refresh**: 10 detik

---

### **12. Office** (`/office`)

**Purpose**: Quick status board

**Features**:
- 📊 **Quick Status Cards**
  - Jobs status
  - Workers status
  - Queue depth
  - Recent activity

**Auto-Refresh**: 10 detik

---

### **13. Prompt** (`/prompt`)

**Purpose**: Natural language job executor

**Features**:
- 💬 **Prompt Input**
  - Text area untuk prompt
  - "Jalankan Sekarang" button
  - Use AI toggle

- 📊 **Execution Results**
  - Jobs created
  - Runs executed
  - Summary

**Auto-Refresh**: On execution only

---

## 🎨 **DESIGN SYSTEM**

### **Color Palette**

```typescript
// Primary Colors
--background: #ffffff
--foreground: #0a0a0a
--card: #ffffff
--card-foreground: #0a0a0a

// Secondary Colors
--secondary: #f5f5f5
--secondary-foreground: #0a0a0a

// Accent Colors
--primary: #18181b
--primary-foreground: #fafafa
--accent: #27272a
--accent-foreground: #fafafa

// Status Colors
--success: #10b981 (emerald-500)
--warning: #f59e0b (amber-500)
--error: #ef4444 (rose-500)
--info: #3b82f6 (blue-500)
```

### **Typography**

```typescript
// Fonts
--font-body: 'Plus Jakarta Sans'
--font-heading: 'Sora'

// Font Sizes
text-xs: 0.75rem (12px)
text-sm: 0.875rem (14px)
text-base: 1rem (16px)
text-lg: 1.125rem (18px)
text-xl: 1.25rem (20px)
text-2xl: 1.5rem (24px)
text-3xl: 1.875rem (30px)
```

### **Components**

#### **Cards**
```typescript
// Standard Card
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
</Card>

// Rounded Cards
className="rounded-[2rem]"  // Extra rounded
className="rounded-3xl"     // Very rounded
className="rounded-2xl"     // Rounded
```

#### **Buttons**
```typescript
// Variants
variant="default"    // Primary color
variant="secondary"  // Secondary color
variant="outline"    // Border only
variant="ghost"      // No border/bg
variant="destructive" // Red (delete)

// Sizes
size="sm"   // Small
size="md"   // Medium
size="lg"   // Large
size="icon" // Icon only
```

#### **Tables**
```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <Cell>Data</Cell>
    </TableRow>
  </TableBody>
</Table>
```

---

## 🔄 **AUTO-REFRESH MECHANISM**

### **React Query Configuration**

```typescript
// All pages use React Query with auto-refresh
const { data, isLoading, isFetching, refetch } = useQuery({
  queryKey: ["jobs", search, filter, page],
  queryFn: () => getJobs({...}),
  refetchInterval: 10000,  // 10 seconds default
});
```

### **Refresh Intervals per Page**

| Page | Interval | Notes |
|------|----------|-------|
| `/` (Home) | 5s | Metrics, 3s Chat |
| `/jobs` | 10s | Jobs list |
| `/runs` | 10s | Runs history |
| `/automation` | 10s | Workflows, approvals |
| `/settings` | 10s | Integrations |
| `/armory` | 5s | Account status |
| `/agents` | 10s | Worker status |
| `/connectors` | 10s | Connector health |

### **Manual Refresh**

```typescript
// Refresh button on all pages
<Button onClick={() => refetch()} disabled={isFetching}>
  <RefreshCw className={isFetching ? "animate-spin" : ""} />
  {isFetching ? "Refreshing..." : "Refresh"}
</Button>
```

---

## 📡 **REAL-TIME FEATURES**

### **Server-Sent Events (SSE)**

```typescript
// SSE Hook
const { events, isConnected, error } = useSSE();

// Connection status
{isConnected ? "Realtime active" : "Using polling fallback"}

// Events stream
events.map(event => (
  <div key={event.id}>
    {event.type}: {event.data}
  </div>
));
```

### **Event Types**

- `job.created` - Job baru dibuat
- `job.enabled` - Job di-enable
- `job.disabled` - Job di-disable
- `run.started` - Run mulai
- `run.completed` - Run selesai
- `run.failed` - Run gagal
- `approval.requested` - Approval baru
- `approval.approved` - Approval disetujui
- `approval.rejected` - Approval ditolak

---

## 🎯 **USER EXPERIENCE**

### **Loading States**

```typescript
// Skeleton loaders
{isLoading && (
  <div className="animate-pulse space-y-4">
    <div className="h-20 bg-muted rounded-2xl"></div>
    <div className="h-20 bg-muted rounded-2xl"></div>
  </div>
)}

// Loading text
{isLoading ? "Loading..." : "Content"}
```

### **Error Handling**

```typescript
// Toast notifications
toast.error("Failed to load jobs", {
  description: "Please try again later"
});

toast.success("Job enabled successfully");

toast.warning("Approval required for this action");
```

### **Empty States**

```typescript
{data.length === 0 && (
  <div className="text-center py-10">
    <Inbox className="h-12 w-12 mx-auto text-muted-foreground" />
    <p className="mt-4 text-muted-foreground">No jobs found</p>
  </div>
)}
```

---

## 📱 **RESPONSIVE DESIGN**

### **Breakpoints**

```typescript
sm: 640px   // Mobile landscape
md: 768px   // Tablet
lg: 1024px  // Desktop
xl: 1280px  // Large desktop
2xl: 1600px // Extra large
```

### **Mobile Adaptations**

- Sidebar → Top navigation (hamburger menu)
- Tables → Card layout
- Multi-column → Single column
- Large text → Smaller text

---

## 🔐 **AUTHENTICATION UI**

### **Token Input**

```typescript
// Settings page - Auth token
<Input
  placeholder="Enter API token"
  value={token}
  onChange={(e) => setToken(e.target.value)}
  type="password"
/>

// Stored in localStorage
localStorage.setItem("spio_api_token", token);
```

### **Role-Based UI**

```typescript
// Show/hide based on role
{role === "admin" && (
  <Button variant="destructive">Delete</Button>
)}

{role === "viewer" && (
  <p className="text-muted-foreground">Read-only mode</p>
)}
```

---

## 🎨 **THEMING**

### **Dark Mode Support**

```typescript
// CSS variables for theming
:root {
  --background: 0 0% 100%
  --foreground: 240 10% 3.9%
}

.dark {
  --background: 240 10% 3.9%
  --foreground: 0 0% 98%
}
```

---

## 📊 **ACCESSIBILITY**

### **ARIA Labels**

```typescript
<Button aria-label="Refresh data">
  <RefreshCw />
</Button>

<nav aria-label="Main navigation">
  ...
</nav>
```

### **Keyboard Navigation**

- Tab through interactive elements
- Enter/Space to activate buttons
- Escape to close modals
- Arrow keys for tables

---

## 🚀 **PERFORMANCE**

### **Optimization Techniques**

1. **Code Splitting**: Next.js automatic code splitting
2. **Lazy Loading**: React.lazy for heavy components
3. **Memoization**: useMemo for expensive calculations
4. **Debouncing**: Search input debouncing (300ms)
5. **Virtual Scrolling**: Large tables pagination

### **Bundle Size**

- Initial load: ~150KB (gzipped)
- Time to interactive: < 2s
- Lighthouse score: 90+

---

## 📋 **SUMMARY**

### **Total Pages**: 13 pages
1. ✅ Home (`/`)
2. ✅ Jobs (`/jobs`)
3. ✅ Automation (`/automation`)
4. ✅ Runs (`/runs`)
5. ✅ Settings (`/settings`)
6. ✅ Armory (`/armory`)
7. ✅ Agents (`/agents`)
8. ✅ Connectors (`/connectors`)
9. ✅ Experiments (`/experiments`)
10. ✅ Skills (`/skills`)
11. ✅ Team (`/team`)
12. ✅ Office (`/office`)
13. ✅ Prompt (`/prompt`)

### **Key Features**
- ✅ Modern design (Tailwind CSS + shadcn/ui)
- ✅ Auto-refresh (5-10 seconds)
- ✅ Real-time updates (SSE)
- ✅ Responsive (mobile/tablet/desktop)
- ✅ Accessible (ARIA, keyboard nav)
- ✅ Performant (code splitting, memoization)
- ✅ TypeScript (type safety)
- ✅ Error handling (toast notifications)

---

**UI sistem SPIO Agent adalah modern, responsive, dan production-ready dashboard untuk manage automation jobs!** 🎉
