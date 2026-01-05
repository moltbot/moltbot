import type { GatewayBrowserClient } from "../gateway";
import type { SkillStatusReport } from "../types";

export type SkillsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsBusyKey: string | null;
  skillEdits: Record<string, string>;
};

export async function loadSkills(state: SkillsState) {
  if (!state.client || !state.connected) return;
  if (state.skillsLoading) return;
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const res = (await state.client.request("skills.status", {})) as
      | SkillStatusReport
      | undefined;
    if (res) state.skillsReport = res;
  } catch (err) {
    state.skillsError = String(err);
  } finally {
    state.skillsLoading = false;
  }
}

export function updateSkillEdit(
  state: SkillsState,
  skillKey: string,
  value: string,
) {
  state.skillEdits = { ...state.skillEdits, [skillKey]: value };
}

export async function updateSkillEnabled(
  state: SkillsState,
  skillKey: string,
  enabled: boolean,
) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    await state.client.request("skills.update", { skillKey, enabled });
    await loadSkills(state);
  } catch (err) {
    state.skillsError = String(err);
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function saveSkillApiKey(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const apiKey = state.skillEdits[skillKey] ?? "";
    await state.client.request("skills.update", { skillKey, apiKey });
    await loadSkills(state);
  } catch (err) {
    state.skillsError = String(err);
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function installSkill(
  state: SkillsState,
  name: string,
  installId: string,
) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = name;
  state.skillsError = null;
  try {
    await state.client.request("skills.install", {
      name,
      installId,
      timeoutMs: 120000,
    });
    await loadSkills(state);
  } catch (err) {
    state.skillsError = String(err);
  } finally {
    state.skillsBusyKey = null;
  }
}

