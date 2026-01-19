import type { RegexDetector } from "./types.js";

const ENV_ASSIGN_PREFIX = String.raw`\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[=:]\s*`;
const CLI_FLAG_PREFIX = String.raw`--(?:api[-_]?key|token|secret|password|passwd)\s+`;

const ENV_ASSIGN_DETECTORS: RegexDetector[] = [
  {
    id: "env-assignment",
    kind: "heuristic",
    confidence: "medium",
    pattern: `${ENV_ASSIGN_PREFIX}"([^"\\r\\n]+)"`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
  {
    id: "env-assignment",
    kind: "heuristic",
    confidence: "medium",
    pattern: `${ENV_ASSIGN_PREFIX}'([^'\\r\\n]+)'`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
  {
    id: "env-assignment",
    kind: "heuristic",
    confidence: "medium",
    pattern: `${ENV_ASSIGN_PREFIX}([^\\s"'\\\\]+)`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
];

const CLI_FLAG_DETECTORS: RegexDetector[] = [
  {
    id: "cli-flag",
    kind: "heuristic",
    confidence: "medium",
    pattern: `${CLI_FLAG_PREFIX}"([^"\\r\\n]+)"`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
  {
    id: "cli-flag",
    kind: "heuristic",
    confidence: "medium",
    pattern: `${CLI_FLAG_PREFIX}'([^'\\r\\n]+)'`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
  {
    id: "cli-flag",
    kind: "heuristic",
    confidence: "medium",
    pattern: `${CLI_FLAG_PREFIX}([^\\s"']+)`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
];

export const heuristicDetectors: RegexDetector[] = [
  ...ENV_ASSIGN_DETECTORS,
  {
    id: "json-field",
    kind: "heuristic",
    confidence: "medium",
    pattern: String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*"([^"]+)"`,
    flags: "gi",
    group: 1,
    redact: "group",
  },
  ...CLI_FLAG_DETECTORS,
];
