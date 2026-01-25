/**
 * θ₃ DECIDE: 処理方針決定、Agent選択
 *
 * 分析結果に基づいて、最適な処理方針とエージェントを選択する。
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import {
  type AnalysisResult,
  ThetaCycleState,
  ThetaEvent,
  ThetaEventType,
  ThetaPhase,
} from "./types.js";
import type { DecisionResult } from "./types.js";

// 型のエクスポート
export type { DecisionResult };

/**
 * 利用可能なエージェントの定義
 */
interface AgentDefinition {
  /** エージェントID */
  id: string;
  /** 対応する意図 */
  intents: string[];
  /** キャパシティ */
  capacity: number;
}

/** 利用可能なエージェント一覧 */
const AVAILABLE_AGENTS: AgentDefinition[] = [
  // 具体的な意図を持つエージェントを先に配置
  { id: "codegen", intents: ["create", "update"], capacity: 5 },
  { id: "review", intents: ["verify", "check"], capacity: 3 },
  { id: "deploy", intents: ["deploy", "release"], capacity: 2 },
  // ワイルドカードエージェントは最後に配置 (fallbackとして機能)
  { id: "conductor", intents: ["*"], capacity: 10 },
];

/**
 * 処理方針の定義
 */
interface StrategyDefinition {
  /** 戦略ID */
  id: string;
  /** 対応する意図 */
  intents: string[];
  /** 推奨エージェント */
  defaultAgent: string;
  /** 推定実行時間(ms) */
  estimatedDuration: number;
}

/** 利用可能な処理方針一覧 */
const AVAILABLE_STRATEGIES: StrategyDefinition[] = [
  {
    id: "direct_execution",
    intents: ["create", "update", "delete"],
    defaultAgent: "codegen",
    estimatedDuration: 5000,
  },
  {
    id: "search_and_retrieve",
    intents: ["search", "find"],
    defaultAgent: "conductor",
    estimatedDuration: 2000,
  },
  {
    id: "verification",
    intents: ["verify", "check"],
    defaultAgent: "review",
    estimatedDuration: 3000,
  },
  {
    id: "deployment",
    intents: ["deploy", "release"],
    defaultAgent: "deploy",
    estimatedDuration: 10000,
  },
];

/**
 * 決定を実行する
 *
 * @param state - θサイクル状態
 * @param analysis - 分析結果
 * @returns 更新された状態と決定結果
 */
export async function decide(
  state: ThetaCycleState,
  analysis?: AnalysisResult,
): Promise<{ state: ThetaCycleState; result: DecisionResult }> {
  const { runId } = state;

  // フェーズ開始イベント
  emitPhaseEvent(runId, ThetaEventType.PHASE_START, {
    phase: ThetaPhase.DECIDE,
  });

  try {
    // 分析結果の取得
    const analysisResult = analysis ?? (state.context.get("analyze.result") as AnalysisResult);
    if (!analysisResult) {
      throw new Error("Analysis result not found");
    }

    // 処理方針の決定
    const strategy = selectStrategy(analysisResult.intent);

    // エージェントの選択
    const agent = selectAgent(analysisResult.intent);

    // パラメータの構築
    const params = buildParams(analysisResult, strategy);

    // 推定実行時間の設定
    const strategyDef = AVAILABLE_STRATEGIES.find((s) => s.id === strategy);
    const estimatedDuration = strategyDef?.estimatedDuration;

    const result: DecisionResult = {
      strategy,
      agent,
      params,
      estimatedDuration,
    };

    // 決定イベント記録
    const decisionEvent: ThetaEvent = {
      runId,
      phase: ThetaPhase.DECIDE,
      timestamp: Date.now(),
      type: ThetaEventType.DECISION,
      data: {
        result,
      },
    };

    state.events.push(decisionEvent);
    state.currentPhase = ThetaPhase.DECIDE;
    state.context.set("decide.result", result);

    // Agentイベントを発行
    emitAgentEvent({
      runId,
      stream: "tool",
      data: {
        type: "decide",
        strategy,
        agent,
        params,
      },
    });

    // フェーズ完了イベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_COMPLETE, {
      phase: ThetaPhase.DECIDE,
      strategy,
      agent,
    });

    return { state, result };
  } catch (error) {
    // エラーイベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_ERROR, {
      phase: ThetaPhase.DECIDE,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 意図に基づいて処理方針を選択する
 */
function selectStrategy(intent: string): string {
  const strategy = AVAILABLE_STRATEGIES.find((s) => s.intents.includes(intent));
  return strategy?.id ?? "default";
}

/**
 * 意図に基づいてエージェントを選択する
 *
 * 具体的な意図へのマッチを優先し、ワイルドカードはfallbackとして使用
 */
function selectAgent(intent: string): string | undefined {
  // まず具体的な意図を探す
  const specificAgent = AVAILABLE_AGENTS.find(
    (a) => a.intents.includes(intent) && !a.intents.includes("*"),
  );
  if (specificAgent) {
    return specificAgent.id;
  }

  // 具体的なマッチがなければワイルドカードを探す
  const wildcardAgent = AVAILABLE_AGENTS.find((a) => a.intents.includes("*"));
  return wildcardAgent?.id;
}

/**
 * パラメータを構築する
 */
function buildParams(analysis: AnalysisResult, strategy: string): Record<string, unknown> {
  return {
    intent: analysis.intent,
    entities: analysis.entities,
    strategy,
    confidence: analysis.confidence,
    timestamp: Date.now(),
  };
}

/**
 * 決定結果を取得する
 *
 * @param state - θサイクル状態
 * @returns 決定結果
 */
export function getDecisionResult(state: ThetaCycleState): DecisionResult | undefined {
  return state.context.get("decide.result") as DecisionResult | undefined;
}

/**
 * 利用可能なエージェント一覧を取得する
 */
export function getAvailableAgents(): AgentDefinition[] {
  return [...AVAILABLE_AGENTS];
}

/**
 * 利用可能な処理方針一覧を取得する
 */
export function getAvailableStrategies(): StrategyDefinition[] {
  return [...AVAILABLE_STRATEGIES];
}

/**
 * フェーズイベントを発行する
 */
function emitPhaseEvent(runId: string, type: ThetaEventType, data: Record<string, unknown>): void {
  emitAgentEvent({
    runId,
    stream: "tool",
    data: {
      type: "theta_event",
      thetaEventType: type,
      ...data,
    },
  });
}
