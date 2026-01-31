import { ensureAuthProfileStore, listProfilesForProvider } from "../agents/auth-profiles.js";
import { resolveEnvApiKey } from "../agents/model-auth.js";
import { tryParseAzureOpenAIEndpoint } from "../agents/azure-openai-provider.js";
import { upsertSharedEnvVar } from "../infra/env-file.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthProfileConfig, setAzureOpenAIApiKey } from "./onboard-auth.js";

function applyPrimaryModel(config: ApplyAuthChoiceParams["config"], model: string) {
  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        model: {
          ...config.agents?.defaults?.model,
          primary: model,
        },
      },
    },
  };
}

export async function applyAuthChoiceAzureOpenAI(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "azure-openai") {
    return null;
  }

  let nextConfig = params.config;
  let agentModelOverride: string | undefined;

  const existingEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim() ?? "";
  const endpointRaw = await params.prompter.text({
    message: "Azure OpenAI endpoint (resource root URL)",
    initialValue: existingEndpoint,
    validate: (value) => {
      const parsed = tryParseAzureOpenAIEndpoint(String(value));
      if (!parsed) {
        return "Expected https://<resource>.openai.azure.com (no path/query)";
      }
      return undefined;
    },
  });
  const parsedEndpoint = tryParseAzureOpenAIEndpoint(String(endpointRaw));
  if (!parsedEndpoint) {
    return { config: nextConfig };
  }

  const existingDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim() ?? "";
  const deploymentName = await params.prompter.text({
    message: "Azure OpenAI deployment name",
    initialValue: existingDeployment,
    validate: (value) => (String(value).trim() ? undefined : "Deployment name is required"),
  });

  const existingApiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() ?? "";
  const apiVersionRaw = await params.prompter.text({
    message: "Azure OpenAI API version (optional)",
    initialValue: existingApiVersion,
  });

  const store = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const existingProfileId = listProfilesForProvider(store, "azure-openai")[0];
  const existingCred = existingProfileId ? store.profiles[existingProfileId] : undefined;

  let apiKey: string | undefined;

  if (existingCred?.type === "api_key" && existingCred.key?.trim()) {
    const useExisting = await params.prompter.confirm({
      message: `Use existing Azure OpenAI API key from auth profile (${existingProfileId})?`,
      initialValue: true,
    });
    if (useExisting) {
      apiKey = existingCred.key;
    }
  }

  if (!apiKey) {
    const envKey = resolveEnvApiKey("azure-openai");
    if (envKey) {
      const useExisting = await params.prompter.confirm({
        message: `Use existing AZURE_OPENAI_API_KEY (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
        initialValue: true,
      });
      if (useExisting) {
        apiKey = envKey.apiKey;
      }
    }
  }

  if (!apiKey) {
    const key = await params.prompter.text({
      message: "Enter Azure OpenAI API key",
      validate: validateApiKeyInput,
    });
    apiKey = normalizeApiKeyInput(String(key));
  }

  await setAzureOpenAIApiKey(normalizeApiKeyInput(String(apiKey)), params.agentDir);

  const envPath = upsertSharedEnvVar({
    key: "AZURE_OPENAI_ENDPOINT",
    value: parsedEndpoint.origin,
  }).path;
  upsertSharedEnvVar({
    key: "AZURE_OPENAI_DEPLOYMENT_NAME",
    value: String(deploymentName).trim(),
  });
  const apiVersionTrimmed = String(apiVersionRaw).trim();
  if (apiVersionTrimmed) {
    upsertSharedEnvVar({
      key: "AZURE_OPENAI_API_VERSION",
      value: apiVersionTrimmed,
    });
  }

  process.env.AZURE_OPENAI_ENDPOINT = parsedEndpoint.origin;
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME = String(deploymentName).trim();
  if (apiVersionTrimmed) {
    process.env.AZURE_OPENAI_API_VERSION = apiVersionTrimmed;
  }

  await params.prompter.note(
    `Saved AZURE_OPENAI_ENDPOINT/AZURE_OPENAI_DEPLOYMENT_NAME to ${envPath} for launchd compatibility.`,
    "Azure OpenAI",
  );

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "azure-openai:default",
    provider: "azure-openai",
    mode: "api_key",
  });

  const modelRef = `azure-openai/${String(deploymentName).trim()}`;
  if (params.setDefaultModel) {
    nextConfig = applyPrimaryModel(nextConfig, modelRef);
    await params.prompter.note(`Default model set to ${modelRef}`, "Model configured");
  } else {
    agentModelOverride = modelRef;
    if (params.agentId) {
      await params.prompter.note(
        `Default model set to ${modelRef} for agent "${params.agentId}".`,
        "Model configured",
      );
    }
  }

  return { config: nextConfig, agentModelOverride };
}
