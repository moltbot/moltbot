/**
 * Feishu bot connection probe
 * @module feishu/probe
 */

import * as lark from "@larksuiteoapi/node-sdk";

import { logVerbose } from "../globals.js";

import type { FeishuProbeResult, ResolvedFeishuAccount } from "./types.js";

/**
 * Probe a Feishu bot to verify credentials and connectivity
 */
export async function probeFeishuBot(account: ResolvedFeishuAccount): Promise<FeishuProbeResult> {
  logVerbose(`feishu: probing bot for account "${account.accountId}"...`);

  try {
    // Create a client instance
    const client = new lark.Client({
      appId: account.appId,
      appSecret: account.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    // Try to get bot info by making a simple API call
    // We'll use the tenant access token endpoint as a connectivity test
    const response = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: account.appId,
        app_secret: account.appSecret,
      },
    });

    if (response.code !== 0) {
      return {
        ok: false,
        error: `API error: ${response.code} - ${response.msg}`,
      };
    }

    // Try to get app info
    try {
      const appInfoResponse = await client.application.application.get({
        params: {
          lang: "zh_cn",
        },
      });

      if (appInfoResponse.code === 0 && appInfoResponse.data?.app) {
        const appInfo = appInfoResponse.data.app;
        logVerbose(`feishu: probe successful - app: ${appInfo.app_name}`);

        return {
          ok: true,
          bot: {
            appName: appInfo.app_name,
            avatarUrl: appInfo.avatar_url,
          },
        };
      }
    } catch {
      // App info might not be available, but token works
    }

    logVerbose(`feishu: probe successful (token valid)`);
    return {
      ok: true,
      bot: {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`feishu: probe failed: ${errorMessage}`);

    return {
      ok: false,
      error: errorMessage,
    };
  }
}

/**
 * Probe with appId and appSecret directly
 */
export async function probeFeishuCredentials(
  appId: string,
  appSecret: string,
): Promise<FeishuProbeResult> {
  logVerbose(`feishu: probing credentials for appId: ${appId.substring(0, 8)}...`);

  try {
    const client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    // Get tenant access token to verify credentials
    const response = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: appId,
        app_secret: appSecret,
      },
    });

    if (response.code !== 0) {
      return {
        ok: false,
        error: `Authentication failed: ${response.code} - ${response.msg}`,
      };
    }

    return {
      ok: true,
      bot: {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: errorMessage,
    };
  }
}
