/**
 * Gateway RPC handlers for secrets management.
 */

import {
  getSecret,
  hasSecret,
  listSecrets,
  removeSecret,
  setSecret,
  type SecretMetadata,
} from "../../secrets/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export type SecretsListResult = {
  secrets: SecretMetadata[];
};

export type SecretsSetParams = {
  name: string;
  value: string;
  description?: string;
};

export type SecretsRemoveParams = {
  name: string;
};

export type SecretsGetParams = {
  name: string;
};

function validateSecretsSetParams(params: unknown): params is SecretsSetParams {
  if (!params || typeof params !== "object") return false;
  const p = params as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) return false;
  if (typeof p.value !== "string") return false;
  return true;
}

function validateSecretsRemoveParams(params: unknown): params is SecretsRemoveParams {
  if (!params || typeof params !== "object") return false;
  const p = params as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) return false;
  return true;
}

function validateSecretsGetParams(params: unknown): params is SecretsGetParams {
  if (!params || typeof params !== "object") return false;
  const p = params as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) return false;
  return true;
}

export const secretsHandlers: GatewayRequestHandlers = {
  "secrets.list": ({ respond }) => {
    try {
      const secrets = listSecrets();
      respond(true, { secrets } satisfies SecretsListResult);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "secrets.set": async ({ params, respond }) => {
    if (!validateSecretsSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid secrets.set params: name and value required",
        ),
      );
      return;
    }

    try {
      const success = await setSecret(params.name.trim(), params.value, params.description?.trim());
      if (success) {
        respond(true, { ok: true });
      } else {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "failed to save secret"));
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "secrets.remove": async ({ params, respond }) => {
    if (!validateSecretsRemoveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid secrets.remove params: name required"),
      );
      return;
    }

    const name = params.name.trim();
    if (!hasSecret(name)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `secret "${name}" not found`),
      );
      return;
    }

    try {
      const success = await removeSecret(name);
      if (success) {
        respond(true, { ok: true });
      } else {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "failed to remove secret"));
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "secrets.has": ({ params, respond }) => {
    if (!validateSecretsGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid secrets.has params: name required"),
      );
      return;
    }

    try {
      const exists = hasSecret(params.name.trim());
      respond(true, { exists });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
