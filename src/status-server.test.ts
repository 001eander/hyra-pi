import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExperienceBank } from "./experience-bank.js";
import { startStatusServer } from "./status-server.js";

async function seeded(): Promise<string> {
  const runDir = await mkdtemp(path.join(tmpdir(), "hyra-pi-http-"));
  await writeFile(
    path.join(runDir, "run.json"),
    JSON.stringify({
      maxProposals: 1,
      maxSandboxes: 1,
      lowWater: 0,
      highWater: 2,
      maxSolutions: 5,
      contextMaxIdleMs: 5000,
    }),
  );
  await writeFile(
    path.join(runDir, "live.json"),
    JSON.stringify({
      phase: "stopped",
      writers: [],
      sandboxes: [],
      contextRunning: false,
      startedAt: 0,
      stopReason: "budget",
    }),
  );
  const incoming = path.join(runDir, "incoming");
  await mkdir(incoming, { recursive: true });
  await writeFile(path.join(incoming, "solve.sh"), "ok\n");
  const bank = await ExperienceBank.open(runDir);
  await bank.commit({
    inspirationId: "i",
    solutionDir: incoming,
    ok: true,
    log: "",
    score: { score: 8, higherIsBetter: true, notes: "" },
  });
  return runDir;
}

describe("status server", () => {
  it("serves the html page and a json snapshot", async () => {
    const runDir = await seeded();
    const server = await startStatusServer(runDir, 0);
    try {
      const page = await (await fetch(server.url)).text();
      expect(page).toContain("最好成绩：8");
      const json = (await (await fetch(`${server.url}/api/status`)).json()) as { best?: { score: number } };
      expect(json.best?.score).toBe(8);
    } finally {
      await server.close();
    }
  });
});
