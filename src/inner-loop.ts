import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExperienceBank, type ExperienceRecord, type Score } from "./experience-bank.js";
import { InspirationQueue, type Inspiration } from "./inspiration-queue.js";
import { ResourceGates } from "./resource-gates.js";

export type ContextDraft = {
  direction: string;
  context: string;
};

export type ContextPort = {
  produce(input: {
    generation: number;
    needsMore: boolean;
    mustStopProducing: boolean;
    best?: ExperienceRecord;
    records: ExperienceRecord[];
  }): Promise<{ inspirations?: ContextDraft[]; stop?: boolean }>;
};

export type ProposalPort = {
  write(input: {
    inspiration: Inspiration;
    workDir: string;
  }): Promise<{ solutionDir: string } | { error: string }>;
};

export type SandboxPort = {
  evaluate(solutionDir: string): Promise<{
    ok: boolean;
    score: Score | null;
    log: string;
  }>;
};

export type LoopPhase = "starting" | "running" | "draining" | "stopped";

export type LiveState = {
  phase: LoopPhase;
  stopReason?: StopReason;
  writers: Array<{ id: string; direction: string }>;
  sandboxes: Array<{ id: string; direction: string }>;
  contextRunning: boolean;
  lastContextAt?: number;
  startedAt: number;
};

export type StopReason = "budget" | "context-stop" | "context-idle";

export type LoopResult = {
  best?: ExperienceRecord;
  records: ExperienceRecord[];
  stopReason: StopReason;
};

export type LoopOptions = {
  runDir: string;
  maxProposals: number;
  maxSandboxes: number;
  lowWater: number;
  highWater: number;
  budget: { maxSolutions: number; maxMs?: number };
  context: ContextPort;
  proposal: ProposalPort;
  sandbox: SandboxPort;
  now?: () => number;
};

export async function runInnerLoop(opts: LoopOptions): Promise<LoopResult> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  await writeFile(
    path.join(opts.runDir, "run.json"),
    JSON.stringify(
      {
        maxProposals: opts.maxProposals,
        maxSandboxes: opts.maxSandboxes,
        lowWater: opts.lowWater,
        highWater: opts.highWater,
        maxSolutions: opts.budget.maxSolutions,
        maxMs: opts.budget.maxMs,
        contextMaxIdleMs: 5_000,
      },
      null,
      2,
    ),
    "utf8",
  );
  const bank = await ExperienceBank.open(opts.runDir);
  const queue = await InspirationQueue.open(opts.runDir, {
    lowWater: opts.lowWater,
    highWater: opts.highWater,
  });
  const gates = new ResourceGates({
    maxProposals: opts.maxProposals,
    maxSandboxes: opts.maxSandboxes,
  });

  const live: LiveState = {
    phase: "starting",
    writers: [],
    sandboxes: [],
    contextRunning: false,
    startedAt,
  };

  const jobs = new Set<Promise<void>>();
  let stopRequested = false;
  let stopReason: StopReason | undefined;

  const persist = async () => {
    live.phase = phaseOf();
    await writeFile(path.join(opts.runDir, "live.json"), JSON.stringify(live, null, 2), "utf8");
  };

  const phaseOf = (): LoopPhase => {
    if (stopReason) return "stopped";
    const remaining = remainingWork();
    if (remaining <= 0 || stopRequested) return live.phase === "starting" ? "starting" : "draining";
    if (bank.generation() === 0) return "starting";
    return "running";
  };

  const remainingWork = () =>
    opts.budget.maxSolutions - bank.generation() - jobs.size;

  const budgetTimeUp = () =>
    opts.budget.maxMs !== undefined && now() - startedAt >= opts.budget.maxMs;

  const runOne = async (insp: Inspiration) => {
    const workDir = path.join(opts.runDir, "workspaces", insp.id);
    await mkdir(workDir, { recursive: true });
    live.writers.push({ id: insp.id, direction: insp.direction });
    await persist();

    let solutionDir = workDir;
    let writeError: string | undefined;
    try {
      const written = await opts.proposal.write({ inspiration: insp, workDir });
      if ("error" in written) writeError = written.error;
      else solutionDir = written.solutionDir;
    } catch (err) {
      writeError = err instanceof Error ? err.message : String(err);
    } finally {
      live.writers = live.writers.filter((row) => row.id !== insp.id);
      gates.finishProposal();
      await persist();
    }

    await gates.acquireSandbox();
    live.sandboxes.push({ id: insp.id, direction: insp.direction });
    await persist();
    try {
      if (writeError) {
        await bank.commit({
          inspirationId: insp.id,
          solutionDir,
          ok: false,
          log: writeError,
          score: null,
        });
      } else {
        const evaluated = await opts.sandbox.evaluate(solutionDir);
        await bank.commit({
          inspirationId: insp.id,
          solutionDir,
          ok: evaluated.ok,
          log: evaluated.log,
          score: evaluated.score,
        });
      }
    } catch (err) {
      await bank.commit({
        inspirationId: insp.id,
        solutionDir,
        ok: false,
        log: err instanceof Error ? err.message : String(err),
        score: null,
      });
    } finally {
      live.sandboxes = live.sandboxes.filter((row) => row.id !== insp.id);
      gates.finishSandbox();
      queue.releaseHold(insp.id);
      await persist();
    }
  };

  const track = (job: Promise<void>) => {
    jobs.add(job);
    job.finally(() => {
      jobs.delete(job);
    });
  };

  try {
    while (!stopReason) {
      if (budgetTimeUp()) stopRequested = true;
      await persist();

      if (jobs.size === 0 && (remainingWork() <= 0 || (stopRequested && queue.waitingCount() === 0))) {
        stopReason = stopRequested && bank.generation() < opts.budget.maxSolutions ? "context-stop" : "budget";
        break;
      }

      let progressed = false;

      if (
        !stopRequested &&
        remainingWork() > 0 &&
        queue.needsMore() &&
        gates.tryStartContext()
      ) {
        live.contextRunning = true;
        await persist();
        try {
          const out = await opts.context.produce({
            generation: bank.generation(),
            needsMore: queue.needsMore(),
            mustStopProducing: queue.mustStopProducing(),
            best: await bank.best(),
            records: await bank.list(),
          });
          if (out.stop) stopRequested = true;
          let added = 0;
          for (const draft of out.inspirations ?? []) {
            if (queue.mustStopProducing()) break;
            const put = await queue.enqueue({
              direction: draft.direction,
              context: draft.context,
              ebGeneration: bank.generation(),
            });
            if (put.ok) added += 1;
          }
          if (
            added === 0 &&
            !stopRequested &&
            queue.waitingCount() === 0 &&
            jobs.size === 0
          ) {
            stopReason = "context-idle";
          }
        } finally {
          live.contextRunning = false;
          live.lastContextAt = now();
          gates.finishContext();
          await persist();
        }
        progressed = true;
        if (stopReason) break;
      }

      while (
        !stopRequested &&
        remainingWork() > 0 &&
        queue.waitingCount() > 0 &&
        gates.tryStartProposal()
      ) {
        const insp = await queue.claim();
        if (!insp) {
          gates.finishProposal();
          break;
        }
        track(runOne(insp));
        progressed = true;
      }

      if (jobs.size > 0) {
        await Promise.race(jobs);
        continue;
      }

      if (!progressed) {
        stopReason = stopRequested ? "context-stop" : "context-idle";
      }
    }
  } finally {
    live.phase = "stopped";
    live.stopReason = stopReason;
    await persist();
  }

  return {
    best: await bank.best(),
    records: await bank.list(),
    stopReason: stopReason ?? "budget",
  };
}
