import { StaticAuthProvider } from "@twurple/auth";
import { ChatClient } from "@twurple/chat";

type Args = {
	token?: string;
	clientId?: string;
	username?: string;
	channel?: string;
	message?: string;
	timeoutMs: number;
};

function parseArgs(argv: string[]): Args {
	const args: Args = { timeoutMs: 10000 };
	for (let i = 0; i < argv.length; i += 1) {
		const key = argv[i];
		const value = argv[i + 1];
		if (!key?.startsWith("--")) continue;
		switch (key) {
			case "--token":
				args.token = value;
				i += 1;
				break;
			case "--client-id":
				args.clientId = value;
				i += 1;
				break;
			case "--username":
				args.username = value;
				i += 1;
				break;
			case "--channel":
				args.channel = value;
				i += 1;
				break;
			case "--message":
				args.message = value;
				i += 1;
				break;
			case "--timeout-ms":
				args.timeoutMs = Number(value ?? 10000);
				i += 1;
				break;
			default:
				break;
		}
	}
	return args;
}

async function run(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const token = args.token;
	const clientId = args.clientId;
	const username = args.username;
	const channel = args.channel ?? username;

	if (!token || !clientId || !username || !channel) {
		console.error(
			"Usage: npx tsx src/cli/test-connect.ts --token <token> --client-id <id> --username <bot> --channel <channel> [--timeout-ms 10000]",
		);
		process.exit(2);
	}

	const normalizedToken = token.startsWith("oauth:") ? token.slice(6) : token;

	const authProvider = new StaticAuthProvider(clientId, normalizedToken);
	const client = new ChatClient({
		authProvider,
		requestMembershipEvents: true,
	});

	const timeout = setTimeout(
		() => {
			console.error("Timed out waiting for connection.");
			process.exit(1);
		},
		Number.isFinite(args.timeoutMs) ? args.timeoutMs : 10000,
	);

	try {
		await client.connect();
		await client.join(channel);
		console.log(`Connected as ${username} and joined #${channel}`);
		if (args.message) {
			await client.say(channel, args.message);
			console.log("Message sent.");
		}
	} finally {
		clearTimeout(timeout);
		client.quit();
	}
}

run().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
