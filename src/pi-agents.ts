import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextPort, ProposalPort } from "./inner-loop.js";
import {
  DEFAULT_CONTEXT_MODEL,
  DEFAULT_PROPOSAL_MODEL,
  parseRoleModel,
  type RoleModel,
} from "./role-model.js";
import { CONTEXT7_TOOLS, context7PiRoot } from "./context7-pi.js";
import { finishProposalWrite } from "./proposal-result.js";
import { withTimeout } from "./timeout.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

// Proposal writes files for the Docker sandbox. Host bash lets it pip-install,
// create venvs, or `find /`, which hangs the demo and never produces solve.sh.
// Context7 is the official Pi port of the Context7 MCP: current library docs only.
export const PROPOSAL_TOOLS = ["read", "write", "edit", "ls", ...CONTEXT7_TOOLS] as const;
export const CONTEXT_TOOLS = ["read", "grep", "find", "ls", "write"] as const;

export async function createPiContext(opts: {
  runDir: string;
  task: string;
  model?: string;
}): Promise<ContextPort> {
  const sdk = await loadSdk();
  const system = await readFile(path.join(rootDir, "prompts", "context.md"), "utf8");
  const session = await openSession(sdk, {
    cwd: opts.runDir,
    system,
    tools: [...CONTEXT_TOOLS],
    roleModel: parseRoleModel(opts.model ?? DEFAULT_CONTEXT_MODEL),
  });

  return {
    async produce(input) {
      const outFile = path.join(opts.runDir, "context-out.json");
      await session.prompt(
        [
          `Task:\n${opts.task}`,
          `Experience bank version: ${input.generation}`,
          `Best so far: ${JSON.stringify(input.best ?? null)}`,
          `Recent records: ${JSON.stringify(input.records.slice(-8))}`,
          `Queue needs more: ${input.needsMore}. Queue is full: ${input.mustStopProducing}.`,
          `Write ${outFile} as JSON: {"inspirations":[{"direction":"...","context":"..."}],"stop":false}`,
          "Then stop.",
        ].join("\n\n"),
      );
      try {
        const raw = JSON.parse(await readFile(outFile, "utf8")) as {
          inspirations?: Array<{ direction: string; context: string }>;
          stop?: boolean;
        };
        return { inspirations: raw.inspirations ?? [], stop: raw.stop };
      } catch {
        return { inspirations: [], stop: false };
      }
    },
  };
}

export async function createPiProposal(opts: { task: string; model?: string }): Promise<ProposalPort> {
  const sdk = await loadSdk();
  const system = await readFile(path.join(rootDir, "prompts", "proposal.md"), "utf8");
  const roleModel = parseRoleModel(opts.model ?? DEFAULT_PROPOSAL_MODEL);
  const timeoutMs = Number(process.env.HYRA_PI_PROPOSAL_MS ?? 360_000);
  return {
    async write({ inspiration, workDir, lastError }) {
      const session = await openSession(sdk, {
        cwd: workDir,
        system,
        tools: [...PROPOSAL_TOOLS],
        roleModel,
        context7: true,
      });
      try {
        const parts = [
          `Task:\n${opts.task}`,
          `Inspiration ${inspiration.id} (bank v${inspiration.ebGeneration}): ${inspiration.direction}`,
          inspiration.context,
        ];
        if (lastError) {
          parts.push(
            `The previous attempt crashed. Read the existing files in ${workDir} and fix them. Do not start from scratch.`,
            `Error:\n${lastError}`,
          );
        }
        parts.push(`Write solve.sh and any helper files in ${workDir}. Do not score it. Then stop.`);
        await withTimeout(session.prompt(parts.join("\n\n")), timeoutMs, "proposal write");
        return finishProposalWrite(workDir);
      } catch (err) {
        return finishProposalWrite(workDir, err);
      } finally {
        session.dispose();
      }
    },
  };
}

type Sdk = typeof import("@earendil-works/pi-coding-agent");

async function loadSdk(): Promise<Sdk> {
  try {
    return await import("@earendil-works/pi-coding-agent");
  } catch {
    throw new Error("缺少依赖 @earendil-works/pi-coding-agent，请先安装后再跑 hyra-pi run");
  }
}

async function openSession(
  sdk: Sdk,
  opts: { cwd: string; system: string; tools: string[]; roleModel: RoleModel; context7?: boolean },
) {
  const loader = new sdk.DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: sdk.getAgentDir(),
    systemPromptOverride: () => opts.system,
    appendSystemPromptOverride: () => [],
    additionalExtensionPaths: opts.context7 ? [context7PiRoot()] : [],
  });
  await loader.reload();
  const modelRuntime = await sdk.ModelRuntime.create();
  const model = await findModel(modelRuntime, opts.roleModel);
  const created = await sdk.createAgentSession({
    cwd: opts.cwd,
    tools: opts.tools,
    resourceLoader: loader,
    sessionManager: sdk.SessionManager.inMemory(opts.cwd),
    modelRuntime,
    model,
    thinkingLevel: opts.roleModel.thinkingLevel,
  });
  return created.session;
}

async function findModel(modelRuntime: Awaited<ReturnType<Sdk["ModelRuntime"]["create"]>>, spec: RoleModel) {
  const direct = modelRuntime.getModel(spec.provider, spec.id);
  if (direct) return direct;
  const available = await modelRuntime.getAvailable();
  const match = available.find((item) => item.provider === spec.provider && item.id === spec.id);
  if (match) return match;
  const listed = available.map((item) => `${item.provider}/${item.id}`).join(", ");
  throw new Error(
    `找不到模型 ${spec.provider}/${spec.id}。当前已登录可用：${listed || "无"}`,
  );
}
