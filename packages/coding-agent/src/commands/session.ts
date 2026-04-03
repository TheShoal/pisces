/**
 * Session inspection command - view session information and statistics.
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { runSessionInspectCommand, type SessionInspectArgs } from "../cli/session-cli";
import { initTheme } from "../modes/theme/theme";

export default class Session extends Command {
	static description = "Inspect session files for analysis and replay";

	static args = {
		path: Args.string({ description: "Path to session file (.jsonl)", required: true }),
	};

	static flags = {
		json: Flags.boolean({ char: "j", description: "Output as JSON", default: false }),
		summary: Flags.boolean({ char: "s", description: "Show summary", default: false }),
		timeline: Flags.boolean({ char: "t", description: "Show tool timeline", default: false }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Session);

		const cmdArgs: SessionInspectArgs = {
			sessionPath: args.path ?? "",
			json: flags.json,
			summary: flags.summary,
			timeline: flags.timeline,
		};

		await initTheme();
		await runSessionInspectCommand(cmdArgs);
	}
}
