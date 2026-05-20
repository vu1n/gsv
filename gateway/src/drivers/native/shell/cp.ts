import { defineCommand, type CommandContext, type ExecResult } from "just-bash";
import type { KernelContext } from "../../../kernel/context";
import { handleFsCopy, type FsCopyDeviceTransport } from "../fs";
import { requireCommandCapability } from "./common";

type ShellCopyEndpoint = {
  target: string;
  path: string;
};

export function buildCpCommand(
  kernelCtx: KernelContext,
  transport?: FsCopyDeviceTransport,
) {
  return defineCommand("cp", async (args, ctx): Promise<ExecResult> => {
    if (args.includes("--help")) {
      return { stdout: "cp SOURCE DEST\n", stderr: "", exitCode: 0 };
    }

    const operands = args.filter((arg) => arg !== "--");
    const unsupported = operands.find((arg) => arg.startsWith("-"));
    if (unsupported) {
      return {
        stdout: "",
        stderr: `cp: unsupported option '${unsupported}'\n`,
        exitCode: 1,
      };
    }
    if (operands.length < 2) {
      return {
        stdout: "",
        stderr: "cp: missing destination file operand\n",
        exitCode: 1,
      };
    }
    if (operands.length > 2) {
      return {
        stdout: "",
        stderr: "cp: multiple source files are not supported yet\n",
        exitCode: 1,
      };
    }

    requireCommandCapability(kernelCtx, "fs.read");
    requireCommandCapability(kernelCtx, "fs.write");

    const source = parseShellCopyEndpoint(operands[0], ctx);
    const destination = parseShellCopyEndpoint(operands[1], ctx);

    try {
      const result = await handleFsCopy(
        {
          source,
          destination,
        },
        kernelCtx,
        transport,
      );
      if (!result.ok) {
        return { stdout: "", stderr: `cp: ${result.error}\n`, exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { stdout: "", stderr: `cp: ${msg}\n`, exitCode: 1 };
    }
  });
}

function parseShellCopyEndpoint(
  spec: string,
  ctx: CommandContext,
): ShellCopyEndpoint {
  const match = spec.match(/^([A-Za-z0-9_.-]+):(.*)$/);
  if (match) {
    const target = match[1] || "gsv";
    const path = match[2] || ".";
    return {
      target,
      path: target === "gsv" ? ctx.fs.resolvePath(ctx.cwd, path) : path,
    };
  }
  return {
    target: "gsv",
    path: ctx.fs.resolvePath(ctx.cwd, spec),
  };
}
