import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ExperienceBank } from "./experience-bank.js";
import { assessHealth, type HealthSnapshot } from "./health.js";
import type { LiveState, LoopPhase } from "./inner-loop.js";

export type StatusView = {
  phase: LoopPhase;
  healthy: boolean;
  reason?: string;
  budget: { maxSolutions: number; remainingSolutions: number };
  queue: Array<{ id: string; direction: string }>;
  writers: Array<{ id: string; direction: string }>;
  sandboxes: Array<{ id: string; direction: string }>;
  context: { running: boolean; lastContextAt?: number };
  best?: { id: string; score: number; higherIsBetter: boolean };
  history: Array<{ id: string; inspirationId: string; ok: boolean; score: number | null }>;
};

type RunConfig = {
  maxProposals: number;
  maxSandboxes: number;
  lowWater: number;
  highWater: number;
  maxSolutions: number;
  contextMaxIdleMs: number;
};

export async function buildStatus(
  runDir: string,
  opts: { now?: number } = {},
): Promise<StatusView> {
  const now = opts.now ?? Date.now();
  const config = JSON.parse(await readFile(path.join(runDir, "run.json"), "utf8")) as RunConfig;
  const live = JSON.parse(await readFile(path.join(runDir, "live.json"), "utf8")) as LiveState;
  const bank = await ExperienceBank.open(runDir);
  const records = await bank.list();
  const bestRecord = await bank.best();
  const waiting = await readWaiting(runDir);

  const writers = live.writers ?? [];
  const sandboxes = live.sandboxes ?? [];
  const healthInput: HealthSnapshot = {
    phase: live.phase,
    waitingCount: waiting.length,
    lowWater: config.lowWater,
    highWater: config.highWater,
    proposalsInFlight: writers.length,
    maxProposals: config.maxProposals,
    sandboxesInFlight: sandboxes.length,
    maxSandboxes: config.maxSandboxes,
    contextRunning: live.contextRunning,
    lastContextAt: live.lastContextAt,
    now,
    contextMaxIdleMs: config.contextMaxIdleMs,
    heldInspirationIds: [...writers, ...sandboxes].map((row) => row.id),
    writers: writers.map((row) => row.id),
  };
  const health = assessHealth(healthInput);

  return {
    phase: live.phase,
    healthy: health.healthy,
    reason: health.reason,
    budget: {
      maxSolutions: config.maxSolutions,
      remainingSolutions: Math.max(0, config.maxSolutions - bank.generation()),
    },
    queue: waiting.map((row) => ({ id: row.id, direction: row.direction })),
    writers,
    sandboxes,
    context: { running: live.contextRunning, lastContextAt: live.lastContextAt },
    best: bestRecord?.score
      ? {
          id: bestRecord.id,
          score: bestRecord.score.score,
          higherIsBetter: bestRecord.score.higherIsBetter,
        }
      : undefined,
    history: records.map((row) => ({
      id: row.id,
      inspirationId: row.inspirationId,
      ok: row.ok,
      score: row.score?.score ?? null,
    })),
  };
}

export function renderStatusHtml(view: StatusView): string {
  const historyRows = view.history
    .map(
      (row) =>
        `<tr><td>${esc(row.id)}</td><td>${esc(row.inspirationId)}</td><td>${row.ok ? "ok" : "fail"}</td><td>${row.score ?? ""}</td></tr>`,
    )
    .join("");
  const list = (items: Array<{ id: string; direction: string }>) =>
    items.length === 0
      ? "<p>none</p>"
      : `<ul>${items.map((item) => `<li>${esc(item.direction)} <code>${esc(item.id)}</code></li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="1" />
  <title>hyra-pi status</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; max-width: 880px; background: #f6f6f4; color: #1a1a1a; }
    h1 { font-size: 20px; }
    section { margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border-bottom: 1px solid #ddd; text-align: left; padding: 6px 8px; }
    .ok { color: #0a7; }
    .bad { color: #c40; }
  </style>
</head>
<body>
  <h1>hyra-pi</h1>
  <section>
    <p>阶段：${esc(view.phase)}</p>
    <p class="${view.healthy ? "ok" : "bad"}">健康：${view.healthy ? "是" : "否"}${view.reason ? ` — ${esc(view.reason)}` : ""}</p>
    <p>预算：还能再评 ${view.budget.remainingSolutions} / ${view.budget.maxSolutions} 份</p>
    <p>Context：${view.context.running ? "正在整理" : "空闲"}${view.context.lastContextAt ? `（上次 ${esc(new Date(view.context.lastContextAt).toLocaleString())}）` : ""}</p>
    <p>最好成绩：${view.best ? view.best.score : "还没有"}</p>
  </section>
  <section>
    <h2>队列</h2>
    ${list(view.queue)}
  </section>
  <section>
    <h2>正在写代码</h2>
    ${list(view.writers)}
  </section>
  <section>
    <h2>正在沙盒里跑</h2>
    ${list(view.sandboxes)}
  </section>
  <section>
    <h2>最近记录</h2>
    <table>
      <thead><tr><th>id</th><th>灵感</th><th>结果</th><th>分数</th></tr></thead>
      <tbody>${historyRows}</tbody>
    </table>
  </section>
</body>
</html>`;
}

async function readWaiting(runDir: string): Promise<Array<{ id: string; direction: string; state?: string }>> {
  const dir = path.join(runDir, "queue");
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const items = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const row = JSON.parse(await readFile(path.join(dir, name), "utf8")) as {
      id: string;
      direction: string;
      state?: string;
    };
    if (row.state === "waiting" || row.state === undefined) items.push(row);
  }
  return items;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
