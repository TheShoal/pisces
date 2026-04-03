/**
 * Session inspection CLI - provides tools for analyzing and replaying sessions.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseJsonlLenient } from "@oh-my-pi/pi-utils";
import type { SessionHeader } from "../session/session-manager";

export interface SessionInspectArgs {
	sessionPath: string;
	json: boolean;
	summary: boolean;
	timeline: boolean;
}

/** Load and parse a session file */
export async function loadSessionFile(sessionPath: string): Promise<{
	header: SessionHeader;
	entries: unknown[];
}> {
	const content = await fs.readFile(sessionPath, "utf-8");
	const lines = parseJsonlLenient<SessionHeader | unknown>(content);

	if (lines.length === 0) {
		throw new Error(`Empty session file: ${sessionPath}`);
	}

	const header = lines[0] as SessionHeader;
	if (header.type !== "session") {
		throw new Error(`Invalid session file: ${sessionPath} - missing header`);
	}

	const entries = lines.slice(1);
	return { header, entries };
}

/** Format duration in human-readable form */
function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
	return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/** Extract basic session info */
function extractSessionInfo(header: SessionHeader, entries: unknown[]) {
	const now = Date.now();
	const startedAt = new Date(header.timestamp).getTime();
	const duration = now - startedAt;

	// Count messages
	let messageCount = 0;
	let toolResultCount = 0;
	let compactionCount = 0;
	let branchCount = 1;
	const toolCounts: Record<string, number> = {};

	for (const entry of entries) {
		const e = entry as Record<string, unknown>;
		if (e.type === "message") {
			messageCount++;
			const msg = e.message as Record<string, unknown>;
			if (msg.role === "toolResult") {
				toolResultCount++;
				const toolName = (msg.toolName as string) || "unknown";
				toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
			}
		} else if (e.type === "compaction") {
			compactionCount++;
		} else if (e.type === "branch_summary") {
			branchCount++;
		}
	}

	// Sort tools by count
	const topTools = Object.entries(toolCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([name, count]) => ({ name, count }));

	return {
		sessionId: header.id,
		title: header.title || "(no title)",
		startedAt: header.timestamp,
		duration: formatDuration(duration),
		durationMs: duration,
		cwd: header.cwd,
		branchCount,
		messageCount,
		toolResultCount,
		compactionCount,
		topTools,
	};
}

/** Build tool timeline from entries */
function buildTimeline(entries: unknown[]): Array<{
	id: string;
	toolName: string;
	startedAt: number;
	durationMs: number;
	success: boolean;
}> {
	const timeline: Array<{
		id: string;
		toolName: string;
		startedAt: number;
		durationMs: number;
		success: boolean;
	}> = [];

	const toolStarts = new Map<string, number>();
	const toolNames = new Map<string, string>();

	// First pass: collect tool call starts and names
	for (const entry of entries) {
		const e = entry as Record<string, unknown>;
		if (e.type === "message") {
			const msg = e.message as Record<string, unknown>;
			if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
				for (const tc of msg.toolCalls) {
					const toolCall = tc as Record<string, unknown>;
					const id = (toolCall.id as string) || `tool-${Math.random().toString(36).slice(2)}`;
					const fn = toolCall.function as Record<string, unknown>;
					const name = (fn?.name as string) || "unknown";
					toolNames.set(id, name);
					toolStarts.set(id, new Date(e.timestamp as string).getTime());
				}
			}
		}
	}

	// Second pass: collect tool results
	for (const entry of entries) {
		const e = entry as Record<string, unknown>;
		if (e.type === "message") {
			const msg = e.message as Record<string, unknown>;
			if (msg.role === "toolResult") {
				const toolCallId = msg.toolCallId as string;
				const toolName = (msg.toolName as string) || toolNames.get(toolCallId) || "unknown";
				const startTime = toolStarts.get(toolCallId);
				const endTime = new Date(e.timestamp as string).getTime();

				if (startTime !== undefined) {
					timeline.push({
						id: toolCallId,
						toolName,
						startedAt: startTime,
						durationMs: endTime - startTime,
						success: !msg.isError,
					});
				}
			}
		}
	}

	return timeline.sort((a, b) => a.startedAt - b.startedAt);
}

/** Print session summary */
async function printSummary(info: ReturnType<typeof extractSessionInfo>): Promise<void> {
	console.log("Session Summary");
	console.log("═".repeat(60));
	console.log(`ID:       ${info.sessionId}`);
	console.log(`Title:    ${info.title}`);
	console.log(`Started:  ${info.startedAt}`);
	console.log(`Duration: ${info.duration}`);
	console.log(`CWD:      ${info.cwd}`);
	console.log();
	console.log("Statistics");
	console.log("─".repeat(60));
	console.log(`Messages:      ${info.messageCount}`);
	console.log(`Tool calls:    ${info.toolResultCount}`);
	console.log(`Branches:      ${info.branchCount}`);
	console.log(`Compactions:   ${info.compactionCount}`);
	console.log();
	console.log("Top Tools");
	console.log("─".repeat(60));
	for (const tool of info.topTools) {
		console.log(`  ${tool.name.padEnd(20)} ${tool.count}`);
	}
}

/** Print tool timeline */
async function printTimeline(
	timeline: Array<{
		id: string;
		toolName: string;
		startedAt: number;
		durationMs: number;
		success: boolean;
	}>,
): Promise<void> {
	console.log("Tool Timeline");
	console.log("═".repeat(60));

	if (timeline.length === 0) {
		console.log("(no tool calls)");
		return;
	}

	for (const tc of timeline) {
		const time = new Date(tc.startedAt).toISOString().slice(11, 23);
		const status = tc.success ? "✓" : "✗";
		const duration = tc.durationMs < 1000 ? `${tc.durationMs}ms` : `${(tc.durationMs / 1000).toFixed(1)}s`;
		console.log(`${time} ${status} ${tc.toolName.padEnd(20)} ${duration}`);
	}
}

/** Run session inspect command */
export async function runSessionInspectCommand(args: SessionInspectArgs): Promise<void> {
	const { sessionPath, json, summary, timeline } = args;

	// Resolve path
	const resolvedPath = path.resolve(sessionPath);

	// Check if file exists
	try {
		await fs.access(resolvedPath);
	} catch {
		console.error(`Error: Session file not found: ${resolvedPath}`);
		process.exit(1);
	}

	// Load session
	const { header, entries } = await loadSessionFile(resolvedPath);
	const info = extractSessionInfo(header, entries);

	// Output based on flags
	if (json) {
		const output: Record<string, unknown> = {
			...info,
			entryCount: entries.length,
		};

		if (timeline) {
			output.timeline = buildTimeline(entries);
		}

		console.log(JSON.stringify(output, null, 2));
	} else {
		// Default to summary if no specific output requested
		const showSummary = summary || !timeline;
		const showTimeline = timeline;

		if (showSummary) {
			await printSummary(info);
		}

		if (showTimeline) {
			if (showSummary) console.log();
			const tl = buildTimeline(entries);
			await printTimeline(tl);
		}
	}
}
