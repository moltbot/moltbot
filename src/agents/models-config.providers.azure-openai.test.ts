import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { upsertAuthProfile } from "./auth-profiles.js";
import { resolveImplicitProviders } from "./models-config.providers.js";
import { uninstallAzureOpenAIFetchWrapper } from "./azure-openai-provider.js";

describe("Azure OpenAI implicit provider", () => {
  const previousEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const previousDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const previousApiKey = process.env.AZURE_OPENAI_API_KEY;
  const previousApiVersion = process.env.AZURE_OPENAI_API_VERSION;

  afterEach(() => {
    uninstallAzureOpenAIFetchWrapper();

    if (previousEndpoint === undefined) {
      delete process.env.AZURE_OPENAI_ENDPOINT;
    } else {
      process.env.AZURE_OPENAI_ENDPOINT = previousEndpoint;
    }

    if (previousDeployment === undefined) {
      delete process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    } else {
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = previousDeployment;
    }

    if (previousApiKey === undefined) {
      delete process.env.AZURE_OPENAI_API_KEY;
    } else {
      process.env.AZURE_OPENAI_API_KEY = previousApiKey;
    }

    if (previousApiVersion === undefined) {
      delete process.env.AZURE_OPENAI_API_VERSION;
    } else {
      process.env.AZURE_OPENAI_API_VERSION = previousApiVersion;
    }
  });

  it("discovers provider from endpoint+deployment when api key is in auth profiles", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "clawd-test-"));

    upsertAuthProfile({
      profileId: "azure-openai:default",
      credential: {
        type: "api_key",
        provider: "azure-openai",
        key: "sk-azure-test",
      },
      agentDir,
    });

    delete process.env.AZURE_OPENAI_API_KEY;
    process.env.AZURE_OPENAI_ENDPOINT = "https://my-resource.openai.azure.com";
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME = "gpt-5";

    const providers = await resolveImplicitProviders({ agentDir });
    expect(providers).toBeTruthy();
    const azure = providers?.["azure-openai"];
    expect(azure).toBeTruthy();
    expect(azure?.baseUrl).toBe("https://my-resource.openai.azure.com/openai/deployments/gpt-5");
    expect(azure?.headers?.["api-key"]).toBe("sk-azure-test");
  });
});
