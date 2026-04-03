import { describe, expect, test } from "bun:test";
import { Effort } from "@oh-my-pi/pi-ai";
import { parseArgs } from "@oh-my-pi/pi-coding-agent/cli/args";

describe("parseArgs", () => {
	describe("--version flag", () => {
		test("parses --version flag", () => {
			const result = parseArgs(["--version"]);
			expect(result.version).toBe(true);
		});

		test("parses -v shorthand", () => {
			const result = parseArgs(["-v"]);
			expect(result.version).toBe(true);
		});

		test("--version takes precedence over other args", () => {
			const result = parseArgs(["--version", "--help", "some message"]);
			expect(result.version).toBe(true);
			expect(result.help).toBe(true);
			expect(result.messages).toContain("some message");
		});
	});

	describe("--help flag", () => {
		test("parses --help flag", () => {
			const result = parseArgs(["--help"]);
			expect(result.help).toBe(true);
		});

		test("parses -h shorthand", () => {
			const result = parseArgs(["-h"]);
			expect(result.help).toBe(true);
		});
	});

	describe("--print flag", () => {
		test("parses --print flag", () => {
			const result = parseArgs(["--print"]);
			expect(result.print).toBe(true);
		});

		test("parses -p shorthand", () => {
			const result = parseArgs(["-p"]);
			expect(result.print).toBe(true);
		});
	});

	describe("--continue flag", () => {
		test("parses --continue flag", () => {
			const result = parseArgs(["--continue"]);
			expect(result.continue).toBe(true);
		});

		test("parses -c shorthand", () => {
			const result = parseArgs(["-c"]);
			expect(result.continue).toBe(true);
		});
	});

	describe("--resume flag", () => {
		test("parses --resume flag", () => {
			const result = parseArgs(["--resume"]);
			expect(result.resume).toBe(true);
		});

		test("parses -r shorthand", () => {
			const result = parseArgs(["-r"]);
			expect(result.resume).toBe(true);
		});

		test("parses --resume with session ID", () => {
			const result = parseArgs(["--resume", "abc123"]);
			expect(result.resume).toBe("abc123");
		});

		test("parses -r with session path", () => {
			const result = parseArgs(["-r", "/path/to/session.jsonl"]);
			expect(result.resume).toBe("/path/to/session.jsonl");
		});

		test("--resume without value before another flag stays boolean", () => {
			const result = parseArgs(["--resume", "--model", "opus"]);
			expect(result.resume).toBe(true);
			expect(result.model).toBe("opus");
		});
	});

	describe("--fork flag", () => {
		test("parses --fork with session ID", () => {
			const result = parseArgs(["--fork", "abc123"]);
			expect(result.fork).toBe("abc123");
		});
	});

	describe("flags with values", () => {
		test("parses --provider", () => {
			const result = parseArgs(["--provider", "openai"]);
			expect(result.provider).toBe("openai");
		});

		test("parses --model", () => {
			const result = parseArgs(["--model", "gpt-4o"]);
			expect(result.model).toBe("gpt-4o");
		});

		test("parses --api-key", () => {
			const result = parseArgs(["--api-key", "sk-test-key"]);
			expect(result.apiKey).toBe("sk-test-key");
		});

		test("parses --system-prompt", () => {
			const result = parseArgs(["--system-prompt", "You are a helpful assistant"]);
			expect(result.systemPrompt).toBe("You are a helpful assistant");
		});

		test("parses --append-system-prompt", () => {
			const result = parseArgs(["--append-system-prompt", "Additional context"]);
			expect(result.appendSystemPrompt).toBe("Additional context");
		});

		test("parses --provider-session-id", () => {
			const result = parseArgs(["--provider-session-id", "reb_cache_key"]);
			expect(result.providerSessionId).toBe("reb_cache_key");
		});

		test("parses --mode", () => {
			const result = parseArgs(["--mode", "json"]);
			expect(result.mode).toBe("json");
		});

		test("parses --mode rpc", () => {
			const result = parseArgs(["--mode", "rpc"]);
			expect(result.mode).toBe("rpc");
		});

		test("parses --mode=json (equals form)", () => {
			const result = parseArgs(["--mode=json"]);
			expect(result.mode).toBe("json");
		});

		test("parses --mode=acp (equals form)", () => {
			const result = parseArgs(["--mode=acp"]);
			expect(result.mode).toBe("acp");
		});

		test("errors on unknown --mode value (space form)", () => {
			const originalStderr = process.stderr;
			const originalExit = process.exit;
			let stderrOutput = "";
			let exitCode: number | undefined;
			process.stderr = {
				write: (s: string) => {
					stderrOutput += s;
					return true;
				},
			} as any;
			process.exit = ((code: number) => {
				exitCode = code;
			}) as any;
			try {
				parseArgs(["--mode", "badmode"]);
			} catch {
				// expected
			}
			process.stderr = originalStderr;
			process.exit = originalExit;
			expect(exitCode).toBe(1);
			expect(stderrOutput).toContain("Unknown mode: badmode");
		});

		test("errors on unknown --mode=value (equals form)", () => {
			const originalStderr = process.stderr;
			const originalExit = process.exit;
			let stderrOutput = "";
			let exitCode: number | undefined;
			process.stderr = {
				write: (s: string) => {
					stderrOutput += s;
					return true;
				},
			} as any;
			process.exit = ((code: number) => {
				exitCode = code;
			}) as any;
			try {
				parseArgs(["--mode=badmode"]);
			} catch {
				// expected
			}
			process.stderr = originalStderr;
			process.exit = originalExit;
			expect(exitCode).toBe(1);
			expect(stderrOutput).toContain("Unknown mode: badmode");
		});

		test("parses --session as alias for --resume", () => {
			const result = parseArgs(["--session", "/path/to/session.jsonl"]);
			expect(result.resume).toBe("/path/to/session.jsonl");
		});

		test("parses --export", () => {
			const result = parseArgs(["--export", "session.jsonl"]);
			expect(result.export).toBe("session.jsonl");
		});

		test("parses --thinking", () => {
			const result = parseArgs(["--thinking", "high"]);
			expect(result.thinking).toBe(Effort.High);
		});

		test("parses --models as comma-separated list", () => {
			const result = parseArgs(["--models", "gpt-4o,claude-sonnet,gemini-pro"]);
			expect(result.models).toEqual(["gpt-4o", "claude-sonnet", "gemini-pro"]);
		});
	});

	describe("--no-session flag", () => {
		test("parses --no-session flag", () => {
			const result = parseArgs(["--no-session"]);
			expect(result.noSession).toBe(true);
		});
	});

	describe("--hook flag", () => {
		test("parses single --hook", () => {
			const result = parseArgs(["--hook", "./my-hook.ts"]);
			expect(result.hooks).toEqual(["./my-hook.ts"]);
		});

		test("parses multiple --hook flags", () => {
			const result = parseArgs(["--hook", "./hook1.ts", "--hook", "./hook2.ts"]);
			expect(result.hooks).toEqual(["./hook1.ts", "./hook2.ts"]);
		});
	});

	describe("--no-extensions flag", () => {
		test("parses --no-extensions flag", () => {
			const result = parseArgs(["--no-extensions"]);
			expect(result.noExtensions).toBe(true);
		});

		test("parses --no-extensions with explicit -e flags", () => {
			const result = parseArgs(["--no-extensions", "-e", "foo.ts", "-e", "bar.ts"]);
			expect(result.noExtensions).toBe(true);
			expect(result.extensions).toEqual(["foo.ts", "bar.ts"]);
		});
	});

	describe("--no-skills flag", () => {
		test("parses --no-skills flag", () => {
			const result = parseArgs(["--no-skills"]);
			expect(result.noSkills).toBe(true);
		});
	});

	describe("--no-rules flag", () => {
		test("parses --no-rules flag", () => {
			const result = parseArgs(["--no-rules"]);
			expect(result.noRules).toBe(true);
		});
	});

	describe("--no-tools flag", () => {
		test("parses --no-tools flag", () => {
			const result = parseArgs(["--no-tools"]);
			expect(result.noTools).toBe(true);
		});

		test("parses --no-tools with explicit --tools flags", () => {
			const result = parseArgs(["--no-tools", "--tools", "read,bash"]);
			expect(result.noTools).toBe(true);
			expect(result.tools).toEqual(["read", "bash"]);
		});

		test("lowercases tool names passed to --tools", () => {
			const result = parseArgs(["--tools", "Read,Grep"]);
			expect(result.tools).toEqual(["read", "grep"]);
		});
	});

	describe("--no-lsp flag", () => {
		test("parses --no-lsp flag", () => {
			const result = parseArgs(["--no-lsp"]);
			expect(result.noLsp).toBe(true);
		});
	});

	describe("messages and file args", () => {
		test("parses plain text messages", () => {
			const result = parseArgs(["hello", "world"]);
			expect(result.messages).toEqual(["hello", "world"]);
		});

		test("parses @file arguments", () => {
			const result = parseArgs(["@README.md", "@src/main.ts"]);
			expect(result.fileArgs).toEqual(["README.md", "src/main.ts"]);
		});

		test("parses mixed messages and file args", () => {
			const result = parseArgs(["@file.txt", "explain this", "@image.png"]);
			expect(result.fileArgs).toEqual(["file.txt", "image.png"]);
			expect(result.messages).toEqual(["explain this"]);
		});

		test("ignores unknown flags starting with -", () => {
			const result = parseArgs(["--unknown-flag", "message"]);
			expect(result.messages).toEqual(["message"]);
		});
	});

	describe("complex combinations", () => {
		test("parses multiple flags together", () => {
			const result = parseArgs([
				"--provider",
				"anthropic",
				"--model",
				"claude-sonnet",
				"--print",
				"--thinking",
				"high",
				"@prompt.md",
				"Do the task",
			]);
			expect(result.provider).toBe("anthropic");
			expect(result.model).toBe("claude-sonnet");
			expect(result.print).toBe(true);
			expect(result.thinking).toBe(Effort.High);
			expect(result.fileArgs).toEqual(["prompt.md"]);
			expect(result.messages).toEqual(["Do the task"]);
		});
	});

	describe("pisces-specific flags", () => {
		test("parses --no-provider-discovery", () => {
			const result = parseArgs(["--no-provider-discovery"]);
			expect(result.noProviderDiscovery).toBe(true);
		});

		test("--no-provider-discovery defaults false", () => {
			const result = parseArgs([]);
			expect(result.noProviderDiscovery).toBeFalsy();
		});

		test("parses --agent with name", () => {
			const result = parseArgs(["--agent", "plan"]);
			expect(result.agent).toBe("plan");
		});

		test("parses --session-dir with path", () => {
			const result = parseArgs(["--session-dir", "/var/pisces/sessions"]);
			expect(result.sessionDir).toBe("/var/pisces/sessions");
		});

		test("parses --list-sessions flag", () => {
			const result = parseArgs(["--list-sessions"]);
			expect(result.listSessions).toBe(true);
		});
	});
});
