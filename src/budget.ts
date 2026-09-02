export type ParsedBudget = {
  maxSolutions: number;
  maxMs?: number;
};

export const DEFAULT_SANDBOX_MS = 1_800_000;
export const DEFAULT_PROPOSAL_MS = 1_800_000;

export function parseDuration(text: string, flag: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(text);
  if (!match) throw new Error(`invalid ${flag} ${text} (use 30s, 30m, or 2h)`);
  const n = Number(match[1]);
  const unit = match[2];
  return unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60_000 : n * 3_600_000;
}

export function parseBudget(text: string | undefined, solutions: string | undefined): ParsedBudget {
  const maxSolutions = solutions ? Number(solutions) : 8;
  if (!Number.isFinite(maxSolutions) || maxSolutions < 1) {
    throw new Error(`invalid --solutions ${solutions}`);
  }
  if (!text) return { maxSolutions };
  return { maxSolutions, maxMs: parseDuration(text, "--budget") };
}

export function parseSandboxMs(flag: string | undefined, env: string | undefined): number {
  if (flag) return parseDuration(flag, "--sandbox");
  if (env !== undefined && env !== "") {
    const n = Number(env);
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid HYRA_PI_SANDBOX_MS ${env}`);
    return n;
  }
  return DEFAULT_SANDBOX_MS;
}

export function parseProposalMs(flag: string | undefined, env: string | undefined): number {
  if (flag) return parseDuration(flag, "--write");
  if (env !== undefined && env !== "") {
    const n = Number(env);
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid HYRA_PI_PROPOSAL_MS ${env}`);
    return n;
  }
  return DEFAULT_PROPOSAL_MS;
}

export function parseArgs(argv: string[]): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  let command: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("-") && !command) {
      command = token;
      out.set("_", token);
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        out.set(key, true);
      } else {
        out.set(key, next);
        i += 1;
      }
    }
  }
  return out;
}
