/**
 * Deep Research message templates
 * Uses telegram formatter for MarkdownV2 and emoji restrictions
 * @see docs/sdd/deep-research/ui-flow.md
 */

import { formatTelegramMessage } from "../telegram/formatter.js";

export interface DeepResearchMessages {
  acknowledgment: (topic: string, transcript?: string) => string;
  startExecution: () => string;
  progress: (stage: DeepResearchProgressStage, runId?: string) => string;
  resultDelivery: (result: DeepResearchResult) => string;
  error: (error: string, runId?: string) => string;
  timeout: () => string;
  cliNotFound: (path: string) => string;
  callbackAcknowledgment: () => string;
  callbackInvalid: () => string;
  callbackUnauthorized: () => string;
  callbackBusy: () => string;
  invalidTopic: () => string;
  gapQuestions: (questions: string[]) => string;
  missingUserId: () => string;
}

export interface DeepResearchResult {
  summaryBullets: string[];
  shortAnswer: string;
  opinion: string;
  publishUrl: string;
}

export type DeepResearchProgressStage =
  | "starting"
  | "working"
  | "summarizing"
  | "publishing"
  | "done"
  | "failed";

type ProgressStep = {
  percent: number;
  label: string;
  detail?: string;
};

const MAX_TRANSCRIPT_CHARS = 260;
const PROGRESS_STEPS: Record<DeepResearchProgressStage, ProgressStep> = {
  starting: {
    percent: 20,
    label: "Запуск",
    detail: "Ожидаемое время: 10-15 минут",
  },
  working: {
    percent: 50,
    label: "Анализ",
    detail: "Собираю источники и анализирую данные...",
  },
  summarizing: {
    percent: 70,
    label: "Сводка",
    detail: "Формирую сводку и ключевые выводы...",
  },
  publishing: {
    percent: 90,
    label: "Публикация",
    detail: "Публикую отчет...",
  },
  done: {
    percent: 100,
    label: "Готово",
  },
  failed: {
    percent: 0,
    label: "Ошибка",
    detail: "Исследование прервано или завершилось ошибкой",
  },
};

function renderProgressBar(percent: number, label: string): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.max(0, Math.min(10, Math.round(clamped / 10)));
  const bar = `${"#".repeat(filled)}${"-".repeat(10 - filled)}`;
  return `[${bar}] ${clamped}%  ${label}`;
}

function truncateTranscript(text: string): string {
  if (text.length <= MAX_TRANSCRIPT_CHARS) return text;
  return `${text.slice(0, MAX_TRANSCRIPT_CHARS - 3)}...`;
}

export const messages: DeepResearchMessages = {
  acknowledgment: (topic: string, transcript?: string) => {
    const lines: string[] = [];
    if (transcript) {
      lines.push("○ Голосовое принято");
      lines.push(`○ Текст: ${truncateTranscript(transcript)}`);
      lines.push("");
    }
    lines.push("● Вижу запрос на deep research");
    lines.push(`Тема: ${topic}`);
    return formatTelegramMessage(lines.join("\n"));
  },

  startExecution: () => {
    const step = PROGRESS_STEPS["starting"];
    const lines: string[] = [renderProgressBar(step.percent, step.label)];
    if (step.detail) {
      lines.push(step.detail);
    }
    return formatTelegramMessage(lines.join("\n"));
  },

  progress: (stage: DeepResearchProgressStage, runId?: string) => {
    const step = PROGRESS_STEPS[stage];
    const lines: string[] = [renderProgressBar(step.percent, step.label)];
    if (step.detail) {
      lines.push(step.detail);
    }
    if (runId) {
      lines.push(`Run ID: ${runId}`);
    }
    return formatTelegramMessage(lines.join("\n"));
  },

  resultDelivery: (result: DeepResearchResult) => {
    const bullets = result.summaryBullets
      .map((b) => `• ${b}`)
      .join("\n");

    const message = `○ Deep Research завершен

○ Краткий ответ:
${result.shortAnswer}

○ Основные пункты:
${bullets}

○ Мнение:
${result.opinion}

○ Полный отчет: ${result.publishUrl}`;
    return formatTelegramMessage(message);
  },

  error: (error: string, runId?: string) => {
    const runInfo = runId ? `\nRun ID: ${runId}` : "";
    const errorText = error.length > 200 ? `${error.slice(0, 200)}...` : error;
    const message = `✂︎ Deep research failed\n\nОшибка: ${errorText}${runInfo}`;
    return formatTelegramMessage(message);
  },

  timeout: () => {
    return formatTelegramMessage(
      "◐ Deep research timeout\n\nИсследование заняло слишком много времени.",
    );
  },

  cliNotFound: (path: string) => {
    const message = `✂︎ CLI not found\n\nПуть: ${path}\nПроверьте настройки deepResearch.cliPath`;
    return formatTelegramMessage(message);
  },

  callbackAcknowledgment: () => "Запускаю deep research...",

  callbackInvalid: () => "Неверные данные кнопки",

  callbackUnauthorized: () => "Кнопка доступна только автору запроса",

  callbackBusy: () => "Депресерч уже выполняется, подождите...",

  invalidTopic: () =>
    "Не удалось определить тему. Укажите тему после /deep.",

  gapQuestions: (questions: string[]) => {
    const lines = questions.map((question, index) =>
      `${index + 1}. ${question}`.trim(),
    );
    return formatTelegramMessage(["Нужны уточнения:", ...lines].join("\n"));
  },

  missingUserId: () =>
    "Не удалось определить пользователя. Проверьте настройки приватности и попробуйте еще раз.",
};
