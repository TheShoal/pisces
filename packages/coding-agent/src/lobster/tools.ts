/**
 * Lobster extension tools for pisces.
 *
 * Ported from lobster-party's config/opencode-runtime/agent.ts.
 * These tools integrate with the majordomo-do sidecar running in the sandbox.
 *
 * Loaded when PISCES_LOBSTER_MODE=1 is set.
 */

import { logger } from "@oh-my-pi/pi-utils";
import { Type } from "@sinclair/typebox";
import { $ } from "bun";
import type { ToolDefinition } from "../extensibility/extensions/types";
import memorySearchDescription from "./prompts/memory-search.md" with { type: "text" };
import messageUserDescription from "./prompts/message-user.md" with { type: "text" };

// ─── Environment ─────────────────────────────────────────────────────────────

/** Unix socket path for the majordomo-do sidecar. */
function getMajordomoSocket(): string {
	const sock = Bun.env.PISCES_MAJORDOMO_SOCKET ?? Bun.env.MAJORDOMO_SOCKET;
	if (!sock) {
		throw new Error(
			"PISCES_MAJORDOMO_SOCKET is not set. The lobster extension requires a majordomo-do sidecar socket.",
		);
	}
	return sock;
}

/** Run-channel key used to scope messages to the current claw session. */
function getRunChannelKey(): string {
	const key = Bun.env.PISCES_RUN_CHANNEL_KEY ?? Bun.env.RUN_CHANNEL_KEY;
	if (!key) {
		throw new Error(
			"PISCES_RUN_CHANNEL_KEY is not set. The lobster extension requires a run-channel key to route messages.",
		);
	}
	return key;
}

// ─── Retry helper ────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [500, 1000, 2000];

async function withRetry<T>(fn: () => Promise<T>, label: string, signal?: AbortSignal): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
		if (signal?.aborted) throw signal.reason ?? new Error(`${label} aborted`);
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			if (attempt < RETRY_DELAYS_MS.length) {
				const delay = RETRY_DELAYS_MS[attempt];
				logger.warn(`${label} failed (attempt ${attempt + 1}), retrying in ${delay}ms`, { error: String(err) });
				await Bun.sleep(delay);
			}
		}
	}
	throw lastError;
}

// ─── messageUser ─────────────────────────────────────────────────────────────

const MessageUserParams = Type.Object({
	text: Type.String({ description: "The message text to send to the user." }),
});

export const messageUserTool: ToolDefinition<typeof MessageUserParams> = {
	name: "messageUser",
	label: "Message User",
	description: messageUserDescription.trim(),
	parameters: MessageUserParams,

	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		const socket = getMajordomoSocket();
		const channelKey = getRunChannelKey();
		const result = await withRetry(
			async () => {
				if (signal?.aborted) throw signal.reason ?? new Error("messageUser aborted");
				const res =
					await $`majordomo-do --socket ${socket} --run-channel-key ${channelKey} --message-user-text ${params.text}`
						.quiet()
						.nothrow();
				if (res.exitCode !== 0) {
					throw new Error(res.stderr.toString().trim() || `majordomo-do exited with code ${res.exitCode}`);
				}
				return res.text().trim();
			},
			"messageUser",
			signal,
		);

		return {
			content: [{ type: "text", text: result || "Message sent." }],
		};
	},
};

// ─── memorySearch ─────────────────────────────────────────────────────────────

const MemorySearchParams = Type.Object({
	query: Type.String({ description: "Search query string." }),
	limit: Type.Optional(
		Type.Number({
			description: "Maximum number of results to return (default: 10).",
			minimum: 1,
			maximum: 100,
		}),
	),
});

export const memorySearchTool: ToolDefinition<typeof MemorySearchParams> = {
	name: "memorySearch",
	label: "Memory Search",
	description: memorySearchDescription.trim(),
	parameters: MemorySearchParams,

	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		const socket = getMajordomoSocket();
		const results = await withRetry(
			async () => {
				if (signal?.aborted) throw signal.reason ?? new Error("memorySearch aborted");
				const args: string[] = ["--socket", socket, "--command-id", "qmd.query"];
				if (params.query) args.push("--query", params.query);
				if (params.limit !== undefined) args.push("--limit", String(params.limit));

				const res = await $`majordomo-do ${args}`.quiet().nothrow();
				if (res.exitCode !== 0) {
					throw new Error(res.stderr.toString().trim() || `majordomo-do exited with code ${res.exitCode}`);
				}
				return res.text().trim();
			},
			"memorySearch",
			signal,
		);

		return {
			content: [{ type: "text", text: results || "No results found." }],
		};
	},
};
