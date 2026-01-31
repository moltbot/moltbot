import chalk from "chalk";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import type { loadConfig } from "../config/config.js";
import { getResolvedLoggerSettings } from "../logging.js";
import { getPublicIPs, isPrivateIP } from "./net.js";

export function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
}) {
  const { provider: agentProvider, model: agentModel } = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const modelRef = `${agentProvider}/${agentModel}`;
  params.log.info(`agent model: ${modelRef}`, {
    consoleMessage: `agent model: ${chalk.whiteBright(modelRef)}`,
  });
  const scheme = params.tlsEnabled ? "wss" : "ws";
  const formatHost = (host: string) => (host.includes(":") ? `[${host}]` : host);
  const hosts =
    params.bindHosts && params.bindHosts.length > 0 ? params.bindHosts : [params.bindHost];
  const primaryHost = hosts[0] ?? params.bindHost;
  params.log.info(
    `listening on ${scheme}://${formatHost(primaryHost)}:${params.port} (PID ${process.pid})`,
  );
  for (const host of hosts.slice(1)) {
    params.log.info(`listening on ${scheme}://${formatHost(host)}:${params.port}`);
  }
  params.log.info(`log file: ${getResolvedLoggerSettings().file}`);
  if (params.isNixMode) {
    params.log.info("gateway: running in Nix mode (config managed externally)");
  }

  // Warn if binding to 0.0.0.0 or a public IP
  warnIfPublicBind(params.bindHost, params.port, params.log);
}

/**
 * Warn if the gateway is binding to an address that exposes it to the public internet.
 * This is how installations end up on Shodan - users deploy on a VPS, bind to 0.0.0.0
 * or a public interface, and expose their gateway to the internet.
 */
function warnIfPublicBind(
  bindAddress: string,
  port: number,
  log: { info: (msg: string, meta?: Record<string, unknown>) => void },
): void {
  // 0.0.0.0 or :: binds to all interfaces
  if (bindAddress === "0.0.0.0" || bindAddress === "::" || bindAddress === "") {
    const publicIPs = getPublicIPs();
    if (publicIPs.length > 0) {
      const warning = [
        "",
        chalk.bgYellow.black(" WARNING ") + chalk.yellow(" Gateway exposed on public interface(s)"),
        chalk.dim("─".repeat(60)),
        `  Bind: ${chalk.cyan(`${bindAddress}:${port}`)}`,
        `  Public IPs: ${chalk.red(publicIPs.join(", "))}`,
        "",
        chalk.dim("  This is how installations end up on Shodan."),
        "",
        chalk.dim("  If intentional: ensure HTTPS + strong auth"),
        chalk.dim("  Recommended: use VPN/Tailscale or loopback + reverse proxy"),
        chalk.dim("─".repeat(60)),
        "",
      ].join("\n");
      log.info(warning, { consoleMessage: warning });
    }
    return;
  }

  // Specific IP bind - check if it's a public IP
  if (!isPrivateIP(bindAddress)) {
    const warning = [
      "",
      chalk.bgYellow.black(" WARNING ") + chalk.yellow(" Gateway binding to public IP"),
      chalk.dim("─".repeat(60)),
      `  Bind: ${chalk.red(`${bindAddress}:${port}`)}`,
      "",
      chalk.dim("  Binding to a public IP exposes your gateway to anyone"),
      chalk.dim("  on the internet who scans your IP."),
      "",
      chalk.dim("  Recommended: bind to 127.0.0.1 and use a reverse proxy,"),
      chalk.dim("  or use VPN/Tailscale for remote access."),
      chalk.dim("─".repeat(60)),
      "",
    ].join("\n");
    log.info(warning, { consoleMessage: warning });
  }
}
