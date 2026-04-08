import type { AgentSessionEvent } from "../session/agent-session";
import type { BudgetSnapshot, BudgetStatus, BudgetViolationReason, RunBudgetPolicy } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_WARN_RATIO = 0.8;

function computeStatus(value: number, limit: number | undefined, warnRatio: number): BudgetStatus {
	if (limit === undefined) return "ok";
	if (value >= limit) return "exceeded";
	if (value >= limit * warnRatio) return "warning";
	return "ok";
}

// ---------------------------------------------------------------------------
// BudgetController
// ---------------------------------------------------------------------------

/**
 * Tracks budget consumption for a session or subagent run by listening to
 * AgentSessionEvents. Emits budget_warning and budget_exceeded events via
 * the provided emit callback when policy thresholds are crossed.
 *
 * Usage:
 *   const controller = new BudgetController(policy, scope, emitFn);
 *   session.subscribe(e => controller.onEvent(e));
 */
export class BudgetController {
	readonly #policy: RunBudgetPolicy;
	readonly #scope: "session" | "task" | "subagent";
	readonly #emit: (event: AgentSessionEvent) => void;
	readonly #warnRatio: number;

	// Counters
	#startTimeMs: number | undefined;
	#inputTokens = 0;
	#outputTokens = 0;
	#totalTokens = 0;
	#costUsd = 0;
	#toolCalls = 0;
	#subagents = 0;

	// Warning dedup — track which dimensions have already fired a warning
	readonly #warnedDimensions = new Set<BudgetViolationReason>();
	// Track whether exceeded event has fired (fire only once)
	#exceededFired = false;
	// Periodic wall-time enforcement
	#wallTimeTimer: NodeJS.Timeout | undefined;

	constructor(
		policy: RunBudgetPolicy,
		scope: "session" | "task" | "subagent",
		emit: (event: AgentSessionEvent) => void,
	) {
		this.#policy = policy;
		this.#scope = scope;
		this.#emit = emit;
		this.#warnRatio = policy.warnAtRatio ?? DEFAULT_WARN_RATIO;
	}

	// -------------------------------------------------------------------------
	// Event ingestion
	// -------------------------------------------------------------------------

	onEvent(event: AgentSessionEvent): void {
		switch (event.type) {
			case "agent_start":
				this.#startTimeMs = Date.now();
				if (this.#policy.maxWallTimeMs !== undefined) {
					const intervalMs = Math.min(5_000, Math.ceil(this.#policy.maxWallTimeMs / 10));
					this.#wallTimeTimer = setInterval(() => this.#checkThresholds(), intervalMs);
				}
				break;

			case "agent_end":
				if (this.#wallTimeTimer) {
					clearInterval(this.#wallTimeTimer);
					this.#wallTimeTimer = undefined;
				}
				break;

			case "turn_end": {
				// Accumulate token usage from the assistant message
				const msg = event.message;
				if (msg.role === "assistant" && "usage" in msg && msg.usage) {
					const u = msg.usage;
					this.#inputTokens += u.input ?? 0;
					this.#outputTokens += u.output ?? 0;
					this.#totalTokens += u.totalTokens ?? (u.input ?? 0) + (u.output ?? 0);
					this.#costUsd += u.cost?.total ?? 0;
				}
				this.#checkThresholds();
				break;
			}

			case "tool_execution_start":
				this.#toolCalls++;
				this.#checkThresholds();
				break;

			case "subagent_start":
				this.#subagents++;
				this.#checkThresholds();
				break;
		}
	}

	// -------------------------------------------------------------------------
	// Enforcement API
	// -------------------------------------------------------------------------

	/**
	 * Returns the current budget snapshot. wallTimeMs is computed at call time.
	 */
	getSnapshot(): BudgetSnapshot {
		const wallTimeMs = this.#startTimeMs ? Date.now() - this.#startTimeMs : 0;
		const { overallStatus, reason } = this.#evaluate(wallTimeMs);
		return {
			status: overallStatus,
			wallTimeMs,
			inputTokens: this.#inputTokens,
			outputTokens: this.#outputTokens,
			totalTokens: this.#totalTokens,
			costUsd: this.#costUsd,
			toolCalls: this.#toolCalls,
			subagents: this.#subagents,
			reason,
		};
	}

	/**
	 * Returns true if any hard limit has been exceeded.
	 * Safe to call at enforcement boundaries before starting expensive work.
	 */
	isExceeded(): boolean {
		return this.getSnapshot().status === "exceeded";
	}

	// -------------------------------------------------------------------------
	// Internal threshold checking
	// -------------------------------------------------------------------------

	#evaluate(wallTimeMs: number): { overallStatus: BudgetStatus; reason: BudgetViolationReason | undefined } {
		const p = this.#policy;
		const r = this.#warnRatio;

		const dimensions: Array<[BudgetViolationReason, number, number | undefined]> = [
			["wall_time", wallTimeMs, p.maxWallTimeMs],
			["input_tokens", this.#inputTokens, p.maxInputTokens],
			["output_tokens", this.#outputTokens, p.maxOutputTokens],
			["total_tokens", this.#totalTokens, p.maxTotalTokens],
			["cost", this.#costUsd, p.maxCostUsd],
			["tool_calls", this.#toolCalls, p.maxToolCalls],
			["subagents", this.#subagents, p.maxSubagents],
		];

		let overallStatus: BudgetStatus = "ok";
		let reason: BudgetViolationReason | undefined;

		for (const [dim, value, limit] of dimensions) {
			const s = computeStatus(value, limit, r);
			if (s === "exceeded") {
				return { overallStatus: "exceeded", reason: dim };
			}
			if (s === "warning" && overallStatus === "ok") {
				overallStatus = "warning";
				reason = dim;
			}
		}

		return { overallStatus, reason };
	}

	#checkThresholds(): void {
		const snapshot = this.getSnapshot();

		if (snapshot.status === "exceeded" && !this.#exceededFired) {
			this.#exceededFired = true;
			if (this.#wallTimeTimer) {
				clearInterval(this.#wallTimeTimer);
				this.#wallTimeTimer = undefined;
			}
			this.#emit({ type: "budget_exceeded", budget: this.#budgetFor(snapshot.reason), spent: this.#spentFor(snapshot.reason), scope: this.#scope, snapshot });
			return;
		}

		if (snapshot.status === "warning" && snapshot.reason && !this.#warnedDimensions.has(snapshot.reason)) {
			this.#warnedDimensions.add(snapshot.reason);
			this.#emit({ type: "budget_warning", budget: this.#budgetFor(snapshot.reason), spent: this.#spentFor(snapshot.reason), scope: this.#scope, snapshot });
		}
	}

	#budgetFor(reason: BudgetViolationReason | undefined): number {
		const p = this.#policy;
		switch (reason) {
			case "wall_time": return p.maxWallTimeMs ?? 0;
			case "input_tokens": return p.maxInputTokens ?? 0;
			case "output_tokens": return p.maxOutputTokens ?? 0;
			case "total_tokens": return p.maxTotalTokens ?? 0;
			case "cost": return p.maxCostUsd ?? 0;
			case "tool_calls": return p.maxToolCalls ?? 0;
			case "subagents": return p.maxSubagents ?? 0;
			default: return 0;
		}
	}

	#spentFor(reason: BudgetViolationReason | undefined): number {
		switch (reason) {
			case "wall_time": return this.#startTimeMs ? Date.now() - this.#startTimeMs : 0;
			case "input_tokens": return this.#inputTokens;
			case "output_tokens": return this.#outputTokens;
			case "total_tokens": return this.#totalTokens;
			case "cost": return this.#costUsd;
			case "tool_calls": return this.#toolCalls;
			case "subagents": return this.#subagents;
			default: return 0;
		}
	}
}
