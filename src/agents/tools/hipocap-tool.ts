import { Type } from "@sinclair/typebox";
import { HipocapClient } from "../../security/hipocap/client.js";
import { getHipocapConfig } from "../../security/hipocap/config.js";
import type { OpenClawConfig } from "../../config/config.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const HIPOCAP_ACTIONS = ["policy.list", "policy.create", "shield.list", "shield.create"] as const;

const HipocapToolSchema = Type.Object({
  action: stringEnum(HIPOCAP_ACTIONS),
  // policy.create
  policyKey: Type.Optional(Type.String()),
  policyName: Type.Optional(Type.String()),
  policyDescription: Type.Optional(Type.String()),
  // shield.create
  shieldKey: Type.Optional(Type.String()),
  shieldName: Type.Optional(Type.String()),
  shieldDescription: Type.Optional(Type.String()),
  shieldType: Type.Optional(Type.String()),
});

export function createHipocapTool(opts?: { config?: OpenClawConfig }): AnyAgentTool {
  return {
    label: "Hipocap",
    name: "hipocap",
    description:
      "Manage Hipocap security policies and shields. List existing ones or create new ones to protect the agent from prompt injection (shields) and data leakage (policies).",
    parameters: HipocapToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      const client = new HipocapClient(getHipocapConfig(opts?.config));

      if (!client.isEnabled()) {
        throw new Error("Hipocap is currently disabled in the configuration.");
      }

      if (action === "policy.list") {
        const policies = await client.listPolicies();
        return jsonResult({ ok: true, policies });
      }

      if (action === "policy.create") {
        const policy_key = readStringParam(params, "policyKey", { required: true });

        const result = await client.createPolicy({
          policy_key,
          roles: ["user"],
          functions: ["*"],
        });
        return jsonResult({ ok: true, result });
      }

      if (action === "shield.list") {
        const shields = await client.listShields();
        return jsonResult({ ok: true, shields });
      }

      if (action === "shield.create") {
        const shield_key = readStringParam(params, "shieldKey", { required: true });
        const name = readStringParam(params, "shieldName") || shield_key;
        const description = readStringParam(params, "shieldDescription") || "";

        const result = await client.createShield({
          shield_key,
          name,
          description,
          prompt_description: description,
          what_to_block: "jailbreak attempts and prompt injections",
          what_not_to_block: "normal user requests",
          is_active: true,
        });
        return jsonResult({ ok: true, result });
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
