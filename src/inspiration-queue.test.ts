import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InspirationQueue } from "./inspiration-queue.js";

async function newQueue(opts?: { lowWater?: number; highWater?: number }) {
  const runDir = await mkdtemp(path.join(tmpdir(), "hyra-pi-q-"));
  const queue = await InspirationQueue.open(runDir, {
    lowWater: opts?.lowWater ?? 1,
    highWater: opts?.highWater ?? 3,
  });
  return { runDir, queue };
}

describe("InspirationQueue", () => {
  it("gives back the same inspiration that was put in", async () => {
    const { queue } = await newQueue();
    const put = await queue.enqueue({
      direction: "try insertion sort",
      context: "best score is 4, last log timed out",
      ebGeneration: 2,
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    const got = await queue.claim();
    expect(got).toEqual({
      id: put.id,
      direction: "try insertion sort",
      context: "best score is 4, last log timed out",
      ebGeneration: 2,
    });
  });

  it("refuses a new inspiration when the queue is already at its high mark", async () => {
    const { queue } = await newQueue({ highWater: 2, lowWater: 1 });
    expect((await queue.enqueue({ direction: "a", context: "a", ebGeneration: 0 })).ok).toBe(true);
    expect((await queue.enqueue({ direction: "b", context: "b", ebGeneration: 0 })).ok).toBe(true);
    expect(queue.mustStopProducing()).toBe(true);

    const third = await queue.enqueue({ direction: "c", context: "c", ebGeneration: 0 });
    expect(third).toEqual({ ok: false, reason: "full" });
    expect(queue.waitingCount()).toBe(2);
  });

  it("asks for more inspirations only while at or below the low mark", async () => {
    const { queue } = await newQueue({ highWater: 3, lowWater: 1 });
    expect(queue.needsMore()).toBe(true);

    await queue.enqueue({ direction: "a", context: "a", ebGeneration: 0 });
    expect(queue.waitingCount()).toBe(1);
    expect(queue.needsMore()).toBe(true);

    await queue.enqueue({ direction: "b", context: "b", ebGeneration: 0 });
    expect(queue.waitingCount()).toBe(2);
    expect(queue.needsMore()).toBe(false);
    expect(queue.mustStopProducing()).toBe(false);
  });

  it("does not let two callers hold the same inspiration", async () => {
    const { queue } = await newQueue({ highWater: 4, lowWater: 1 });
    const first = await queue.enqueue({ direction: "one", context: "one", ebGeneration: 1 });
    const second = await queue.enqueue({ direction: "two", context: "two", ebGeneration: 1 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const claimedA = await queue.claim();
    const claimedB = await queue.claim();
    const claimedC = await queue.claim();

    expect(claimedA?.id).not.toBe(claimedB?.id);
    expect([claimedA?.id, claimedB?.id].sort()).toEqual([first.id, second.id].sort());
    expect(claimedC).toBeUndefined();
    expect(queue.isHeld(first.id)).toBe(true);
    expect(queue.isHeld(second.id)).toBe(true);
  });
});
