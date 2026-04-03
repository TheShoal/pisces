import type { AgentSessionEvent } from "../session/agent-session";

// ---------------------------------------------------------------------------
// Span model
// ---------------------------------------------------------------------------

export type SpanStatus = "unset" | "ok" | "error";

export interface TelemetrySpan {
	/** Trace-scoped unique span ID (hex string). */
	spanId: string;
	/** Parent span ID, or undefined for root spans. */
	parentSpanId?: string;
	/** Trace ID shared by all spans in one agent session. */
	traceId: string;
	/** OTel-style span name, e.g. "pisces.turn". */
	name: string;
	/** Unix epoch in milliseconds. */
	startTimeMs: number;
	/** Unix epoch in milliseconds; undefined while span is open. */
	endTimeMs?: number;
	status: SpanStatus;
	/** Freeform string/number/boolean attributes. */
	attributes: Record<string, string | number | boolean | string[]>;
}

// ---------------------------------------------------------------------------
// Attribute key constants
// ---------------------------------------------------------------------------

/** pisces.* semantic attribute names */
export const Attr = {
	// Session
	SESSION_ID: "pisces.session.id",
	SESSION_FILE: "pisces.session.file",

	// Turn
	TURN_INDEX: "pisces.turn.index",

	// Agent
	AGENT_NAME: "pisces.agent.name",
	AGENT_SOURCE: "pisces.agent.source",

	// Model
	MODEL_NAME: "pisces.model.name",
	PROVIDER_NAME: "pisces.provider.name",

	// Tool
	TOOL_NAME: "pisces.tool.name",
	TOOL_CALL_ID: "pisces.tool.call_id",
	TOOL_IS_ERROR: "pisces.tool.is_error",

	// Subagent
	SUBAGENT_ID: "pisces.subagent.id",
	SUBAGENT_ISOLATED: "pisces.subagent.isolated",
	SUBAGENT_EXIT_CODE: "pisces.subagent.exit_code",

	// Verification
	VERIFICATION_PROFILE: "pisces.verification.profile",
	VERIFICATION_ATTEMPT: "pisces.verification.attempt",
	VERIFICATION_STATUS: "pisces.verification.status",
	VERIFICATION_COMMAND: "pisces.verification.command",
	VERIFICATION_COMMAND_EXIT_CODE: "pisces.verification.command.exit_code",
	VERIFICATION_COMMAND_DURATION_MS: "pisces.verification.command.duration_ms",
	VERIFICATION_ARTIFACT_ID: "pisces.verification.artifact_id",

	// Retry
	RETRY_COUNT: "pisces.retry.count",
	RETRY_MAX_ATTEMPTS: "pisces.retry.max_attempts",
	RETRY_DELAY_MS: "pisces.retry.delay_ms",
	RETRY_ERROR: "pisces.retry.error",

	// Compaction
	COMPACTION_ACTION: "pisces.compaction.action",
	COMPACTION_REASON: "pisces.compaction.reason",

	// TTSR
	TTSR_RULES: "pisces.ttsr.rules",

	// Isolation
	ISOLATION_MODE: "pisces.isolation.mode",

	// gen_ai semantic conventions (OTel)
	GEN_AI_INPUT_TOKENS: "gen_ai.request.input_tokens",
	GEN_AI_OUTPUT_TOKENS: "gen_ai.response.output_tokens",
	GEN_AI_TOTAL_TOKENS: "gen_ai.usage.total_tokens",
	GEN_AI_COST: "gen_ai.cost.total",
	GEN_AI_TOOL_DEFINITIONS: "gen_ai_tool_definitions",
} as const;

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Central telemetry adapter. Receives AgentSession events and converts them
 * to spans (or any other backend representation). The default implementation
 * is a no-op; replace via setAdapter() for real instrumentation.
 */
export interface RuntimeTelemetryAdapter {
	/** Called for every event emitted from AgentSession. */
	onEvent(event: AgentSessionEvent): void;
	/** Called on session dispose. Flush pending spans before resolving. */
	shutdown(): Promise<void>;
}
