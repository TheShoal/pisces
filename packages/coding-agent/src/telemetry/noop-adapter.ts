import type { RuntimeTelemetryAdapter } from "./types";

export class NoopTelemetryAdapter implements RuntimeTelemetryAdapter {
	onEvent(): void {}

	shutdown(): Promise<void> {
		return Promise.resolve();
	}
}
