import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { runConfigureWizard } from "./configure.js";

export async function updateCommand(runtime: RuntimeEnv = defaultRuntime) {
  await runConfigureWizard(
    {
      command: "update",
      sections: [
        "workspace",
        "model",
        "gateway",
        "daemon",
        "providers",
        "skills",
        "health",
      ],
    },
    runtime,
  );
}
