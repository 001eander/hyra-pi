import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExperienceBank } from "./experience-bank.js";
import { buildStatus, renderStatusHtml } from "./status.js";

async function seedRun(): Promise<string> {
  const runDir = await mkdtemp(path.join(tmpdir(), "hyra-pi-st-"));
  await writeFile(
    path.join(runDir, "run.json"),
    JSON.stringify({
      maxProposals: 2,
      maxSandboxes: 2,
      lowWater: 1,
      highWater: 3,
      maxSolutions: 10,
      contextMaxIdleMs: 5000,
    }),
    "utf8",
  );
  await writeFile(
    path.join(runDir, "live.json"),
    JSON.stringify({
      phase: "running",
      writers: [
        { id: "insp-002", direction: "rewrite inner loop" },
        { id: "insp-004", direction: "tune pivot" },
      ],
      sandboxes: [{ id: "insp-003", direction: "cache keys" }],
      contextRunning: false,
      lastContextAt: 1_000,
      startedAt: 0,
    }),
    "utf8",
  );
  await mkdir(path.join(runDir, "queue"), { recursive: true });
  await writeFile(
    path.join(runDir, "queue", "insp-001.json"),
    JSON.stringify({
      id: "insp-001",
      direction: "try merge sort",
      context: "best is 4",
      ebGeneration: 1,
      state: "waiting",
    }),
    "utf8",
  );

  const incoming = path.join(runDir, "incoming");
  await mkdir(incoming, { recursive: true });
  await writeFile(path.join(incoming, "solve.sh"), "#!/bin/sh\necho seeded\n", "utf8");
  const bank = await ExperienceBank.open(runDir);
  await bank.commit({
    inspirationId: "insp-000",
    solutionDir: incoming,
    ok: true,
    log: "ok",
    score: { score: 4, higherIsBetter: true, notes: "seed" },
  });
  return runDir;
}

describe("status view", () => {
  it("builds the page data from the run folder", async () => {
    const runDir = await seedRun();
    const view = await buildStatus(runDir, { now: 1_200 });

    expect(view.phase).toBe("running");
    expect(view.healthy).toBe(true);
    expect(view.budget).toEqual({ maxSolutions: 10, remainingSolutions: 9 });
    expect(view.queue).toEqual([{ id: "insp-001", direction: "try merge sort" }]);
    expect(view.writers).toEqual([
      { id: "insp-002", direction: "rewrite inner loop" },
      { id: "insp-004", direction: "tune pivot" },
    ]);
    expect(view.sandboxes).toEqual([{ id: "insp-003", direction: "cache keys" }]);
    expect(view.context).toEqual({ running: false, lastContextAt: 1_000 });
    expect(view.best).toEqual({ id: "0001", score: 4, higherIsBetter: true });
    expect(view.history).toEqual([
      { id: "0001", inspirationId: "insp-000", ok: true, score: 4 },
    ]);
  });

  it("copies the health reason when the loop looks stuck", async () => {
    const runDir = await seedRun();
    await writeFile(
      path.join(runDir, "live.json"),
      JSON.stringify({
        phase: "running",
        writers: [],
        sandboxes: [],
        contextRunning: false,
        lastContextAt: 1_000,
        startedAt: 0,
      }),
      "utf8",
    );
    const view = await buildStatus(runDir, { now: 1_200 });
    expect(view.healthy).toBe(false);
    expect(view.reason).toBe("队列里有活，但没人领");
  });

  it("renders a read-only page with the best score and queue direction", async () => {
    const runDir = await seedRun();
    const html = renderStatusHtml(await buildStatus(runDir, { now: 1_200 }));
    expect(html).toContain("try merge sort");
    expect(html).toContain("4");
    expect(html).toContain("rewrite inner loop");
    expect(html).toContain("cache keys");
    expect(html).not.toContain("kill");
    expect(html).not.toContain("<form");
  });
});
