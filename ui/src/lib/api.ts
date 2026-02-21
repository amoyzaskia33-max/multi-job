import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface JobSpec {
  job_id: string;
  type: string;
  enabled?: boolean;
  schedule?: {
    cron?: string;
    interval_sec?: number;
  };
  timeout_ms: number;
  retry_policy: {
    max_retry: number;
    backoff_sec: number[];
  };
  inputs: Record<string, unknown>;
  last_run_time?: string;
}

export interface Run {
  run_id: string;
  job_id: string;
  status: "queued" | "running" | "success" | "failed";
  attempt: number;
  scheduled_at: string;
  started_at?: string;
  finished_at?: string;
  result?: {
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
    duration_ms?: number;
  };
  trace_id?: string;
}

export interface Connector {
  channel: string;
  account_id: string;
  status: "online" | "offline" | "degraded";
  last_heartbeat_at?: string;
  reconnect_count?: number;
  last_error?: string;
}

export interface TelegramConnectorAccount {
  account_id: string;
  enabled: boolean;
  has_bot_token: boolean;
  bot_token_masked?: string;
  allowed_chat_ids: string[];
  use_ai: boolean;
  force_rule_based: boolean;
  run_immediately: boolean;
  wait_seconds: number;
  timezone: string;
  default_channel: string;
  default_account_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface TelegramConnectorAccountUpsertRequest {
  bot_token?: string;
  allowed_chat_ids: string[];
  enabled: boolean;
  use_ai: boolean;
  force_rule_based: boolean;
  run_immediately: boolean;
  wait_seconds: number;
  timezone: string;
  default_channel: string;
  default_account_id: string;
}

export interface McpIntegrationServer {
  server_id: string;
  enabled: boolean;
  transport: "stdio" | "http" | "sse";
  description: string;
  command: string;
  args: string[];
  url: string;
  headers: Record<string, string>;
  env: Record<string, string>;
  has_auth_token: boolean;
  auth_token_masked?: string;
  timeout_sec: number;
  created_at?: string;
  updated_at?: string;
}

export interface McpIntegrationServerUpsertRequest {
  enabled: boolean;
  transport: "stdio" | "http" | "sse";
  description: string;
  command: string;
  args: string[];
  url: string;
  headers: Record<string, string>;
  env: Record<string, string>;
  auth_token?: string;
  timeout_sec: number;
}

export interface IntegrationAccount {
  provider: string;
  account_id: string;
  enabled: boolean;
  has_secret: boolean;
  secret_masked?: string;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface IntegrationAccountUpsertRequest {
  enabled: boolean;
  secret?: string;
  config: Record<string, unknown>;
}

export interface IntegrationProviderTemplate {
  provider: string;
  label: string;
  description: string;
  auth_hint: string;
  default_account_id: string;
  default_enabled: boolean;
  default_config: Record<string, unknown>;
}

export interface McpServerTemplate {
  template_id: string;
  server_id: string;
  label: string;
  description: string;
  transport: "stdio" | "http" | "sse";
  command: string;
  args: string[];
  url: string;
  headers: Record<string, string>;
  env: Record<string, string>;
  timeout_sec: number;
  default_enabled: boolean;
}

export interface IntegrationsCatalog {
  providers: IntegrationProviderTemplate[];
  mcp_servers: McpServerTemplate[];
}

export interface IntegrationsBootstrapRequest {
  provider_ids?: string[];
  mcp_template_ids?: string[];
  account_id?: string;
  overwrite?: boolean;
}

export interface IntegrationsBootstrapResponse {
  account_id: string;
  overwrite: boolean;
  providers_created: string[];
  providers_updated: string[];
  providers_skipped: string[];
  mcp_created: string[];
  mcp_updated: string[];
  mcp_skipped: string[];
}

export interface Agent {
  id: string;
  type?: string;
  status: "online" | "offline";
  last_heartbeat: string;
  active_sessions?: number;
  version?: string;
}

export interface SystemMetrics {
  queue_depth: number;
  delayed_count: number;
  worker_count: number;
  scheduler_online: boolean;
  redis_online: boolean;
  api_online: boolean;
}

export interface SystemEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface PlannerExecutionResult {
  job_id: string;
  type: string;
  create_status: "created" | "updated" | "error";
  run_id?: string;
  queue_status?: string;
  run_status?: "queued" | "running" | "success" | "failed";
  result_success?: boolean;
  result_error?: string;
}

export interface PlannerExecuteResponse {
  planner_source: "rule_based" | "smolagents";
  summary: string;
  assumptions: string[];
  warnings: string[];
  results: PlannerExecutionResult[];
}

export interface PlannerExecuteRequest {
  prompt: string;
  use_ai?: boolean;
  force_rule_based?: boolean;
  run_immediately?: boolean;
  wait_seconds?: number;
  timezone?: string;
}

export interface AgentWorkflowAutomationRequest {
  job_id: string;
  prompt: string;
  interval_sec?: number;
  cron?: string;
  enabled?: boolean;
  timezone?: string;
  default_channel?: string;
  default_account_id?: string;
  require_approval_for_missing?: boolean;
  allow_overlap?: boolean;
  dispatch_jitter_sec?: number;
  failure_threshold?: number;
  failure_cooldown_sec?: number;
  failure_cooldown_max_sec?: number;
  failure_memory_enabled?: boolean;
  timeout_ms?: number;
  max_retry?: number;
  backoff_sec?: number[];
}

export interface AgentWorkflowAutomationJob extends JobSpec {
  status?: "created" | "updated";
}

export interface ApprovalRequest {
  approval_id: string;
  status: "pending" | "approved" | "rejected";
  source: string;
  run_id: string;
  job_id: string;
  job_type: string;
  prompt: string;
  summary: string;
  request_count: number;
  approval_requests: Record<string, unknown>[];
  available_providers: Record<string, unknown>;
  available_mcp_servers: unknown[];
  created_at: string;
  updated_at: string;
  decided_at?: string;
  decision_by?: string;
  decision_note?: string;
}

const handleApiError = <T>(error: unknown, message: string, fallback: T): T => {
  console.error(`${message}:`, error);
  toast.error(message);
  return fallback;
};

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

const send = async <T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

export const getJobs = async (): Promise<JobSpec[]> => {
  try {
    return await getJson<JobSpec[]>("/jobs");
  } catch (error) {
    return handleApiError(error, "Gagal memuat daftar tugas", []);
  }
};

export const getAgentWorkflowAutomations = async (): Promise<AgentWorkflowAutomationJob[]> => {
  try {
    return await getJson<AgentWorkflowAutomationJob[]>("/automation/agent-workflows");
  } catch (error) {
    return handleApiError(error, "Gagal memuat job otomatis", []);
  }
};

export const upsertAgentWorkflowAutomation = async (
  payload: AgentWorkflowAutomationRequest,
): Promise<AgentWorkflowAutomationJob | undefined> => {
  try {
    return await send<AgentWorkflowAutomationJob>("/automation/agent-workflow", "POST", payload);
  } catch (error) {
    return handleApiError(error, "Gagal menyimpan job otomatis", undefined);
  }
};

export const createJob = async (job: JobSpec): Promise<JobSpec | undefined> => {
  try {
    return await send<JobSpec>("/jobs", "POST", job);
  } catch (error) {
    return handleApiError(error, "Gagal membuat tugas baru", undefined);
  }
};

export const enableJob = async (jobId: string): Promise<boolean> => {
  try {
    await send<{ job_id: string; status: string }>(`/jobs/${jobId}/enable`, "PUT");
    return true;
  } catch (error) {
    return handleApiError(error, "Gagal mengaktifkan tugas", false);
  }
};

export const disableJob = async (jobId: string): Promise<boolean> => {
  try {
    await send<{ job_id: string; status: string }>(`/jobs/${jobId}/disable`, "PUT");
    return true;
  } catch (error) {
    return handleApiError(error, "Gagal menonaktifkan tugas", false);
  }
};

export const triggerJob = async (jobId: string): Promise<boolean> => {
  try {
    await send<{ run_id: string; status: string }>(`/jobs/${jobId}/run`, "POST");
    return true;
  } catch (error) {
    return handleApiError(error, "Gagal menjalankan tugas", false);
  }
};

export const getRuns = async (params?: { job_id?: string; limit?: number; status?: string }): Promise<Run[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.job_id) queryParams.append("job_id", params.job_id);
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.status) queryParams.append("status", params.status);
    const path = `/runs${queryParams.size ? `?${queryParams.toString()}` : ""}`;
    return await getJson<Run[]>(path);
  } catch (error) {
    return handleApiError(error, "Gagal memuat riwayat eksekusi", []);
  }
};

export const getRun = async (runId: string): Promise<Run | undefined> => {
  try {
    return await getJson<Run>(`/runs/${runId}`);
  } catch (error) {
    return handleApiError(error, "Gagal memuat detail eksekusi", undefined);
  }
};

export const getConnectors = async (): Promise<Connector[]> => {
  try {
    return await getJson<Connector[]>("/connectors");
  } catch (error) {
    return handleApiError(error, "Gagal memuat data koneksi", []);
  }
};

export const getTelegramConnectorAccounts = async (): Promise<TelegramConnectorAccount[]> => {
  try {
    return await getJson<TelegramConnectorAccount[]>("/connector/telegram/accounts");
  } catch (error) {
    return handleApiError(error, "Gagal memuat akun Telegram", []);
  }
};

export const upsertTelegramConnectorAccount = async (
  accountId: string,
  payload: TelegramConnectorAccountUpsertRequest,
): Promise<TelegramConnectorAccount | undefined> => {
  try {
    return await send<TelegramConnectorAccount>(`/connector/telegram/accounts/${accountId}`, "PUT", payload);
  } catch (error) {
    return handleApiError(error, "Gagal menyimpan akun Telegram", undefined);
  }
};

export const deleteTelegramConnectorAccount = async (accountId: string): Promise<boolean> => {
  try {
    await send<{ account_id: string; status: string }>(`/connector/telegram/accounts/${accountId}`, "DELETE");
    return true;
  } catch (error) {
    return handleApiError(error, "Gagal menghapus akun Telegram", false);
  }
};

export const getMcpIntegrationServers = async (): Promise<McpIntegrationServer[]> => {
  try {
    return await getJson<McpIntegrationServer[]>("/integrations/mcp/servers");
  } catch (error) {
    return handleApiError(error, "Gagal memuat daftar MCP server", []);
  }
};

export const upsertMcpIntegrationServer = async (
  serverId: string,
  payload: McpIntegrationServerUpsertRequest,
): Promise<McpIntegrationServer | undefined> => {
  try {
    return await send<McpIntegrationServer>(`/integrations/mcp/servers/${serverId}`, "PUT", payload);
  } catch (error) {
    return handleApiError(error, "Gagal menyimpan MCP server", undefined);
  }
};

export const deleteMcpIntegrationServer = async (serverId: string): Promise<boolean> => {
  try {
    await send<{ server_id: string; status: string }>(`/integrations/mcp/servers/${serverId}`, "DELETE");
    return true;
  } catch (error) {
    return handleApiError(error, "Gagal menghapus MCP server", false);
  }
};

export const getIntegrationAccounts = async (provider?: string): Promise<IntegrationAccount[]> => {
  try {
    const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    return await getJson<IntegrationAccount[]>(`/integrations/accounts${query}`);
  } catch (error) {
    return handleApiError(error, "Gagal memuat akun integrasi", []);
  }
};

export const upsertIntegrationAccount = async (
  provider: string,
  accountId: string,
  payload: IntegrationAccountUpsertRequest,
): Promise<IntegrationAccount | undefined> => {
  try {
    return await send<IntegrationAccount>(`/integrations/accounts/${provider}/${accountId}`, "PUT", payload);
  } catch (error) {
    return handleApiError(error, "Gagal menyimpan akun integrasi", undefined);
  }
};

export const deleteIntegrationAccount = async (provider: string, accountId: string): Promise<boolean> => {
  try {
    await send<{ provider: string; account_id: string; status: string }>(
      `/integrations/accounts/${provider}/${accountId}`,
      "DELETE",
    );
    return true;
  } catch (error) {
    return handleApiError(error, "Gagal menghapus akun integrasi", false);
  }
};

export const getIntegrationsCatalog = async (): Promise<IntegrationsCatalog> => {
  try {
    return await getJson<IntegrationsCatalog>("/integrations/catalog");
  } catch (error) {
    return handleApiError(error, "Gagal memuat katalog konektor", { providers: [], mcp_servers: [] });
  }
};

export const bootstrapIntegrationsCatalog = async (
  payload: IntegrationsBootstrapRequest,
): Promise<IntegrationsBootstrapResponse | undefined> => {
  try {
    return await send<IntegrationsBootstrapResponse>("/integrations/catalog/bootstrap", "POST", payload);
  } catch (error) {
    return handleApiError(error, "Gagal menambahkan template konektor", undefined);
  }
};

export const getAgents = async (): Promise<Agent[]> => {
  try {
    return await getJson<Agent[]>("/agents");
  } catch (error) {
    return handleApiError(error, "Gagal memuat data agen", []);
  }
};

export const checkHealth = async () => {
  try {
    const [healthResponse, readyResponse] = await Promise.all([
      fetch(`${API_BASE}/healthz`),
      fetch(`${API_BASE}/readyz`),
    ]);

    return {
      apiHealthy: healthResponse.ok,
      systemReady: readyResponse.ok,
    };
  } catch {
    return {
      apiHealthy: false,
      systemReady: false,
    };
  }
};

export const getQueueMetrics = async (): Promise<{ depth: number; delayed: number }> => {
  try {
    return await getJson<{ depth: number; delayed: number }>("/queue");
  } catch (error) {
    return handleApiError(error, "Gagal memuat metrik antrean", { depth: 0, delayed: 0 });
  }
};

export const getSystemMetrics = async (): Promise<SystemMetrics> => {
  const [health, queue, agents] = await Promise.all([checkHealth(), getQueueMetrics(), getAgents()]);
  return {
    queue_depth: queue.depth,
    delayed_count: queue.delayed,
    worker_count: agents.filter((agent) => agent.type !== "scheduler").length,
    scheduler_online: agents.some((agent) => agent.type === "scheduler" && agent.status === "online"),
    redis_online: health.systemReady,
    api_online: health.apiHealthy,
  };
};

export const getEvents = async (params?: { since?: string; limit?: number }): Promise<SystemEvent[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.since) queryParams.append("since", params.since);
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    const path = `/events${queryParams.size ? `?${queryParams.toString()}` : ""}`;
    return await getJson<SystemEvent[]>(path);
  } catch (error) {
    return handleApiError(error, "Gagal memuat update skill", []);
  }
};

export const getApprovalRequests = async (params?: {
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}): Promise<ApprovalRequest[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append("status", params.status);
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    const path = `/approvals${queryParams.size ? `?${queryParams.toString()}` : ""}`;
    return await getJson<ApprovalRequest[]>(path);
  } catch (error) {
    return handleApiError(error, "Gagal memuat approval queue", []);
  }
};

export const approveApprovalRequest = async (
  approvalId: string,
  payload?: { decision_by?: string; decision_note?: string },
): Promise<ApprovalRequest | undefined> => {
  try {
    return await send<ApprovalRequest>(`/approvals/${approvalId}/approve`, "POST", payload || {});
  } catch (error) {
    return handleApiError(error, "Gagal approve request", undefined);
  }
};

export const rejectApprovalRequest = async (
  approvalId: string,
  payload?: { decision_by?: string; decision_note?: string },
): Promise<ApprovalRequest | undefined> => {
  try {
    return await send<ApprovalRequest>(`/approvals/${approvalId}/reject`, "POST", payload || {});
  } catch (error) {
    return handleApiError(error, "Gagal menolak request", undefined);
  }
};

export const executePlannerPrompt = async (payload: PlannerExecuteRequest): Promise<PlannerExecuteResponse> => {
  return await send<PlannerExecuteResponse>("/planner/execute", "POST", payload);
};
