/**
 * Module-level registry for the CronService singleton.
 *
 * The gateway creates a single CronService instance. The cron tool needs
 * direct access to it to avoid WebSocket self-deadlock when the embedded
 * agent calls cron operations from within the same process.
 *
 * This registry avoids threading the instance through 7+ layers of params.
 */

import type { CronService } from "./service.js";

let instance: CronService | undefined;

export function setCronServiceInstance(svc: CronService): void {
  instance = svc;
}

export function getCronServiceInstance(): CronService | undefined {
  return instance;
}
