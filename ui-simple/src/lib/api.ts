import { toast } from "sonner";

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const DEFAULT_REFRESH_MS = 10000;
const API_BASE_KEY = "job_studio_api_base";
const REFRESH_MS_KEY = "job_studio_refresh_ms";

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
  inputs: Record<string, any>;
}

export interface Run {
  run_id: string;
  job_id: string;
  status: "queued" | "running" | "success" | "failed";
  attempt: number;
  scheduled_at: string;
  inputs?: Record<string, any>;
  started_at?: string;
  finished_at?: string;
  result?: {
    success: boolean;
    output?: Record<string, any>;
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
  last_error?: string | null;
}

export interface Agent {
  id: string;
  type?: string;
  status: "online" | "offline";
  last_heartbeat: string;
  active_sessions?: number;
  version?: string;
}

export interface Event {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface SystemMetrics {
  queue_depth: number;
  delayed_count: number;
  worker_count: number;
  scheduler_online: boolean;
  redis_online: boolean;
  api_online: boolean;
}

const readStorage = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
};

const writeStorage = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
};

export const getApiBase = (): string => readStorage(API_BASE_KEY) || DEFAULT_API_BASE;

export const setApiBase = (baseUrl: string) => {
  writeStorage(API_BASE_KEY, baseUrl);
};

export const getRefreshIntervalMs = (): number => {
  const stored = readStorage(REFRESH_MS_KEY);
  const parsed = stored ? Number(stored) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_REFRESH_MS;
};

export const setRefreshIntervalMs = (value: number) => {
  const safe = Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_REFRESH_MS;
  writeStorage(REFRESH_MS_KEY, String(safe));
};

const apiUrl = (path: string) => `${getApiBase()}${path}`;

const handleApiError = <T>(error: unknown, message: string, fallback: T): T => {
  console.error(`${message}:`, error);
  toast.error(message);
  return fallback;
};

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

const send = async <T>(path: string, method: "POST" | "PUT", body?: unknown): Promise<T> => {
  const response = await fetch(apiUrl(path), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

export const checkHealth = async () => {
  try {
    const [healthResponse, readyResponse] = await Promise.all([
      fetch(apiUrl("/healthz")),
      fetch(apiUrl("/readyz")),
    ]);
    return {
      apiHealthy: healthResponse.ok,
      systemReady: readyResponse.ok,
    };
  } catch (error) {
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
    return handleApiError(error, "Gagal memuat data antrian", { depth: 0, delayed: 0 });
  }
};

export const getConnectors = async (): Promise<Connector[]> => {
  try {
    return await getJson<Connector[]>("/connectors");
  } catch (error) {
    return handleApiError(error, "Gagal memuat data koneksi", []);
  }
};

export const getAgents = async (): Promise<Agent[]> => {
  try {
    return await getJson<Agent[]>("/agents");
  } catch (error) {
    return handleApiError(error, "Gagal memuat data agen", []);
  }
};

export const getJobs = async (): Promise<JobSpec[]> => {
  try {
    return await getJson<JobSpec[]>("/jobs");
  } catch (error) {
    return handleApiError(error, "Gagal memuat daftar tugas", []);
  }
};

export const createJob = async (job: JobSpec): Promise<{ job_id: string; status: string } | undefined> => {
  try {
    return await send<{ job_id: string; status: string }>("/jobs", "POST", job);
  } catch (error) {
    return handleApiError(error, "Gagal membuat tugas", undefined);
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
    const url = `/runs${queryParams.size ? `?${queryParams}` : ""}`;
    return await getJson<Run[]>(url);
  } catch (error) {
    return handleApiError(error, "Gagal memuat riwayat proses", []);
  }
};

export const getRun = async (runId: string): Promise<Run | undefined> => {
  try {
    return await getJson<Run>(`/runs/${runId}`);
  } catch (error) {
    return handleApiError(error, "Gagal memuat detail proses", undefined);
  }
};

export const getEvents = async (since?: string): Promise<Event[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (since) queryParams.append("since", since);
    const url = `/events${queryParams.size ? `?${queryParams}` : ""}`;
    return await getJson<Event[]>(url);
  } catch (error) {
    return handleApiError(error, "Gagal memuat aktivitas terbaru", []);
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
