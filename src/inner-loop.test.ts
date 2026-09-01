import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInnerLoop, type ContextPort, type ProposalPort, type SandboxPort } from "./inner-loop.js";

async function runDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "hyra-pi-loop-"));
}

function writingProposal(): ProposalPort {
  return {
    async write({ workDir }) {
      await mkdir(workDir, { recursive: true });
      await writeFile(path.join(workDir, "solve.sh"), "#!/bin/sh\necho ok\n", "utf8");
      return { solutionDir: workDir };
    },
  };
}

function scriptedContext(turns: Array<{ directions?: string[]; stop?: boolean }>): ContextPort {
  let i = 0;
  return {
    async produce() {
      const turn = turns[Math.min(i, turns.length - 1)]!;
      i += 1;
      return {
        stop: turn.stop,
        inspirations: (turn.directions ?? []).map((direction) => ({
          direction,
          context: `try ${direction}`,
        })),
      };
    },
  };
}

function scriptedSandbox(
  results: Array<{ ok: boolean; score: number | null; log: string }>,
): SandboxPort {
  let i = 0;
  return {
    async evaluate() {
      const row = results[Math.min(i, results.length - 1)]!;
      i += 1;
      return {
        ok: row.ok,
        log: row.log,
        score:
          row.score === null
            ? null
            : { score: row.score, higherIsBetter: true, notes: row.log },
      };
    },
  };
}

describe("inner loop", () => {
  it("writes a scored solution into the experience bank and returns it as best", async () => {
    const root = await runDir();
    const result = await runInnerLoop({
      runDir: root,
      maxProposals: 1,
      maxSandboxes: 1,
      lowWater: 0,
      highWater: 2,
      budget: { maxSolutions: 1 },
      context: scriptedContext([{ directions: ["first-idea"] }]),
      proposal: writingProposal(),
      sandbox: scriptedSandbox([{ ok: true, score: 6, log: "score 6" }]),
    });

    expect(result.stopReason).toBe("budget");
    expect(result.best?.score?.score).toBe(6);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.inspirationId).toBeDefined();
    expect(result.records[0]?.ok).toBe(true);
  });

  it("records a failed and a timed-out evaluation instead of dropping them", async () => {
    const root = await runDir();
    const result = await runInnerLoop({
      runDir: root,
      maxProposals: 1,
      maxSandboxes: 1,
      lowWater: 0,
      highWater: 3,
      budget: { maxSolutions: 2 },
      context: scriptedContext([{ directions: ["a", "b"] }]),
      proposal: writingProposal(),
      sandbox: scriptedSandbox([
        { ok: false, score: null, log: "eval crashed" },
        { ok: false, score: null, log: "timeout" },
      ]),
    });

    expect(result.records).toHaveLength(2);
    expect(result.records.map((row) => row.ok)).toEqual([false, false]);
    expect(result.records.map((row) => row.score)).toEqual([null, null]);
    expect(result.best).toBeUndefined();
    expect(result.records.map((row) => row.logPath).every(Boolean)).toBe(true);
  });

  it("stops when Context asks to stop and still returns the best so far", async () => {
    const root = await runDir();
    const result = await runInnerLoop({
      runDir: root,
      maxProposals: 1,
      maxSandboxes: 1,
      lowWater: 0,
      highWater: 2,
      budget: { maxSolutions: 99 },
      context: scriptedContext([
        { directions: ["keep"] },
        { directions: [], stop: true },
      ]),
      proposal: writingProposal(),
      sandbox: scriptedSandbox([{ ok: true, score: 3, log: "ok" }]),
    });

    expect(result.stopReason).toBe("context-stop");
    expect(result.best?.score?.score).toBe(3);
  });
});
