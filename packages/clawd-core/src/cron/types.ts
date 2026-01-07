/**
 * Cron schedule types - defines when jobs run
 */
export type CronSchedule =
  | { kind: "at"; atMs: number }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

/**
 * Where the cron job runs
 * - main: Injects system event into main agent session
 * - isolated: Runs separate agent session, posts summary to main
 */
export type CronSessionTarget = "main" | "isolated";

/**
 * When to wake the agent after job triggers
 * - now: Immediate heartbeat
 * - next-heartbeat: Wait for scheduled heartbeat
 */
export type CronWakeMode = "next-heartbeat" | "now";

/**
 * Cron job payload - what happens when job runs
 */
export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      thinking?: string;
      timeoutSeconds?: number;
      deliver?: boolean;
      provider?:
        | "last"
        | "whatsapp"
        | "telegram"
        | "discord"
        | "slack"
        | "signal"
        | "imessage";
      to?: string;
      bestEffortDeliver?: boolean;
    };

/**
 * Isolation settings for isolated jobs
 */
export type CronIsolation = {
  postToMainPrefix?: string;
};

/**
 * Runtime state of a cron job
 */
export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

/**
 * Complete cron job definition
 */
export type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  isolation?: CronIsolation;
  state: CronJobState;
};

/**
 * Persisted cron store format
 */
export type CronStoreFile = {
  version: 1;
  jobs: CronJob[];
};

/**
 * Input for creating a new cron job
 */
export type CronJobCreate = Omit<
  CronJob,
  "id" | "createdAtMs" | "updatedAtMs" | "state"
> & {
  state?: Partial<CronJobState>;
};

/**
 * Input for updating an existing cron job
 */
export type CronJobPatch = Partial<
  Omit<CronJob, "id" | "createdAtMs" | "state"> & { state: CronJobState }
>;

/**
 * Cron event emitted by the service
 */
export type CronEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished";
  runAtMs?: number;
  durationMs?: number;
  status?: "ok" | "error" | "skipped";
  error?: string;
  summary?: string;
  nextRunAtMs?: number;
};
