import { NoopTelemetryAdapter } from "./noop-adapter";
import type { RuntimeTelemetryAdapter } from "./types";

export * from "./noop-adapter";
export * from "./otel-adapter";
export * from "./types";

// ---------------------------------------------------------------------------
// Process-level adapter registry
// ---------------------------------------------------------------------------

let activeAdapter: RuntimeTelemetryAdapter = new NoopTelemetryAdapter();

/** Returns the currently registered telemetry adapter. */
export function getAdapter(): RuntimeTelemetryAdapter {
	return activeAdapter;
}

/**
 * Replace the active adapter. Any previously registered adapter is replaced
 * immediately (call shutdown() on it yourself if needed before swapping).
 */
export function setAdapter(adapter: RuntimeTelemetryAdapter): void {
	activeAdapter = adapter;
}
