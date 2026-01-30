import type { ChannelId } from "../channels/plugins/types.js";
import { normalizeChannelId } from "../channels/plugins/index.js";
import type { NativeCommandsSetting, NativeSkillsSetting } from "./types.js";

function resolveAutoDefault(providerId?: ChannelId): boolean {
  const id = normalizeChannelId(providerId);
  if (!id) return false;
  if (id === "discord" || id === "telegram") return true;
  if (id === "slack") return false;
  return false;
}

export function resolveNativeSkillsEnabled(params: {
  providerId: ChannelId;
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
}): boolean {
  const { providerId, providerSetting, globalSetting } = params;
  const setting = providerSetting === undefined ? globalSetting : providerSetting;
  if (setting === true) return true;
  if (setting === false) return false;
  return resolveAutoDefault(providerId);
}

// Returns boolean (enable all/none) or string[] (whitelist of skill names)
export function resolveNativeSkillsSetting(params: {
  providerId: ChannelId;
  providerSetting?: NativeSkillsSetting;
  globalSetting?: NativeSkillsSetting;
}): boolean | string[] {
  const { providerId, providerSetting, globalSetting } = params;
  const setting = providerSetting === undefined ? globalSetting : providerSetting;
  // If it is an array, return the whitelist
  if (Array.isArray(setting)) return setting;
  // Otherwise resolve as boolean
  if (setting === true) return true;
  if (setting === false) return false;
  return resolveAutoDefault(providerId);
}

export function resolveNativeCommandsEnabled(params: {
  providerId: ChannelId;
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
}): boolean {
  const { providerId, providerSetting, globalSetting } = params;
  const setting = providerSetting === undefined ? globalSetting : providerSetting;
  if (setting === true) return true;
  if (setting === false) return false;
  // auto or undefined -> heuristic
  return resolveAutoDefault(providerId);
}

export function isNativeCommandsExplicitlyDisabled(params: {
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
}): boolean {
  const { providerSetting, globalSetting } = params;
  if (providerSetting === false) return true;
  if (providerSetting === undefined) return globalSetting === false;
  return false;
}
