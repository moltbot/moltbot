import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { t } from "../i18n/index.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildAuthChoiceGroups } from "./auth-choice-options.js";
import type { AuthChoice } from "./onboard-types.js";

const BACK_VALUE = "__back";

export async function promptAuthChoiceGrouped(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
}): Promise<AuthChoice> {
  const { groups, skipOption } = buildAuthChoiceGroups(params);
  const availableGroups = groups.filter((group) => group.options.length > 0);

  while (true) {
    const providerOptions = [
      ...availableGroups.map((group) => ({
        value: group.value,
        label: group.label,
        hint: group.hint,
      })),
      ...(skipOption ? [skipOption] : []),
    ];

    const providerSelection = (await params.prompter.select({
      message: t("Model/auth provider"),
      options: providerOptions,
    })) as string;

    if (providerSelection === "skip") {
      return "skip";
    }

    const group = availableGroups.find((candidate) => candidate.value === providerSelection);

    if (!group || group.options.length === 0) {
      await params.prompter.note(
        t("No auth methods available for that provider."),
        t("Model/auth choice"),
      );
      continue;
    }

    const methodSelection = (await params.prompter.select({
      message: t(`${group.label} auth method`),
      options: [...group.options, { value: BACK_VALUE, label: t("Back") }],
    })) as string;

    if (methodSelection === BACK_VALUE) {
      continue;
    }

    return methodSelection as AuthChoice;
  }
}
