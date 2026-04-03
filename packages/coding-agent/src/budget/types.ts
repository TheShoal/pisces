// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Hard-cap policy for a session, task batch, or individual subagent run.
 * All fields are optional; undefined means "no limit for this dimension".
 */
export interface RunBudgetPolicy {
	/** Maximum wall-clock time from start to now, in milliseconds. */
	maxWallTimeMs?: number;
	/** Maximum total input tokens consumed. */
	maxInputTokens?: number;
	/** Maximum total output tokens generated. */
	maxOutputTokens?: number;
	/** Maximum combined input+output token count. */
	maxTotalTokens?: number;
	/** Maximum total cost in US dollars. */
	maxCostUsd?: number;
	/** Maximum number of tool calls dispatched. */
	maxToolCalls?: number;
	/** Maximum number of subagent spawns. */
	maxSubagents?: number;
	/**
	 * Fraction of any limit at which a budget_warning event is emitted.
	 * Default: 0.8 (80%).
	 */
	warnAtRatio?: number;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export type BudgetStatus = "ok" | "warning" | "exceeded";

export type BudgetViolationReason =
	| "wall_time"
	| "input_tokens"
	| "output_tokens"
	| "total_tokens"
	| "cost"
	| "tool_calls"
	| "subagents";

/**
 * Point-in-time view of budget consumption relative to an active policy.
 * Emitted with budget_warning and budget_exceeded events.
 */
export interface BudgetSnapshot {
	status: BudgetStatus;
	wallTimeMs: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number;
	toolCalls: number;
	subagents: number;
	/** Set when status is "warning" or "exceeded". */
	reason?: BudgetViolationReason;
}
