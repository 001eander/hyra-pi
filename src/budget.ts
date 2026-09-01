export type ParsedBudget = {
  maxSolutions: number;
  maxMs?: number;
};

export function parseBudget(text: string | undefined, solutions: string | undefined): ParsedBudget {
  const maxSolutions = solutions ? Number(solutions) : 8;
  if (!Number.isFinite(maxSolutions) || maxSolutions < 1) {
    throw new Error(`invalid --solutions ${solutions}`);
  }
  if (!text) return { maxSolutions };
  const match = /^(\d+)(ms|s|m|h)$/.exec(text);
  if (!match) throw new Error(`invalid --budget ${text} (use 30s, 30m, or 2h)`);
  const n = Number(match[1]);
  const unit = match[2];
  const maxMs =
    unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60_000 : n * 3_600_000;
  return { maxSolutions, maxMs };
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
