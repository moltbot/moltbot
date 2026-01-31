import type { GatewayBrowserClient } from "../gateway";

export type SecretMetadata = {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type SecretsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  secretsLoading: boolean;
  secretsList: SecretMetadata[];
  secretsError: string | null;
  secretsBusyKey: string | null;
  secretsMessage: { kind: "success" | "error"; message: string } | null;
  // For add/edit form
  secretsEditName: string;
  secretsEditValue: string;
  secretsEditDescription: string;
  secretsShowAddForm: boolean;
};

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function loadSecrets(state: SecretsState) {
  if (!state.client || !state.connected) return;
  if (state.secretsLoading) return;
  state.secretsLoading = true;
  state.secretsError = null;
  try {
    const res = (await state.client.request("secrets.list", {})) as
      | { secrets: SecretMetadata[] }
      | undefined;
    if (res?.secrets) {
      state.secretsList = res.secrets;
    }
  } catch (err) {
    state.secretsError = getErrorMessage(err);
  } finally {
    state.secretsLoading = false;
  }
}

export async function addSecret(state: SecretsState) {
  if (!state.client || !state.connected) return;
  const name = state.secretsEditName.trim();
  const value = state.secretsEditValue;
  const description = state.secretsEditDescription.trim() || undefined;

  if (!name) {
    state.secretsMessage = { kind: "error", message: "Secret name is required" };
    return;
  }
  if (!value) {
    state.secretsMessage = { kind: "error", message: "Secret value is required" };
    return;
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    state.secretsMessage = {
      kind: "error",
      message: "Name should be UPPER_SNAKE_CASE (e.g., GITHUB_TOKEN)",
    };
    return;
  }

  state.secretsBusyKey = name;
  state.secretsError = null;
  state.secretsMessage = null;

  try {
    await state.client.request("secrets.set", { name, value, description });
    await loadSecrets(state);
    state.secretsMessage = { kind: "success", message: `Secret ${name} saved` };
    // Clear form
    state.secretsEditName = "";
    state.secretsEditValue = "";
    state.secretsEditDescription = "";
    state.secretsShowAddForm = false;
  } catch (err) {
    state.secretsMessage = { kind: "error", message: getErrorMessage(err) };
  } finally {
    state.secretsBusyKey = null;
  }
}

export async function removeSecret(state: SecretsState, name: string) {
  if (!state.client || !state.connected) return;
  if (!confirm(`Remove secret "${name}"? This cannot be undone.`)) return;

  state.secretsBusyKey = name;
  state.secretsError = null;
  state.secretsMessage = null;

  try {
    await state.client.request("secrets.remove", { name });
    await loadSecrets(state);
    state.secretsMessage = { kind: "success", message: `Secret ${name} removed` };
  } catch (err) {
    state.secretsMessage = { kind: "error", message: getErrorMessage(err) };
  } finally {
    state.secretsBusyKey = null;
  }
}

export function showAddSecretForm(state: SecretsState) {
  state.secretsShowAddForm = true;
  state.secretsEditName = "";
  state.secretsEditValue = "";
  state.secretsEditDescription = "";
  state.secretsMessage = null;
}

export function hideAddSecretForm(state: SecretsState) {
  state.secretsShowAddForm = false;
  state.secretsEditName = "";
  state.secretsEditValue = "";
  state.secretsEditDescription = "";
}

export function updateSecretEditName(state: SecretsState, value: string) {
  state.secretsEditName = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

export function updateSecretEditValue(state: SecretsState, value: string) {
  state.secretsEditValue = value;
}

export function updateSecretEditDescription(state: SecretsState, value: string) {
  state.secretsEditDescription = value;
}
