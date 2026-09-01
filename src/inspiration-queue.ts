import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type Inspiration = {
  id: string;
  direction: string;
  context: string;
  ebGeneration: number;
};

export type EnqueueInput = {
  direction: string;
  context: string;
  ebGeneration: number;
};

export type EnqueueResult =
  | { ok: true; id: string }
  | { ok: false; reason: "full" };

export class InspirationQueue {
  readonly runDir: string;
  readonly lowWater: number;
  readonly highWater: number;
  private nextId = 1;
  private waiting: Inspiration[] = [];
  private held = new Map<string, Inspiration>();

  private constructor(runDir: string, lowWater: number, highWater: number) {
    this.runDir = runDir;
    this.lowWater = lowWater;
    this.highWater = highWater;
  }

  static async open(
    runDir: string,
    opts: { lowWater: number; highWater: number },
  ): Promise<InspirationQueue> {
    if (opts.lowWater < 0 || opts.highWater < 1 || opts.lowWater > opts.highWater) {
      throw new Error("queue marks must satisfy 0 <= lowWater <= highWater");
    }
    const queue = new InspirationQueue(runDir, opts.lowWater, opts.highWater);
    await mkdir(path.join(runDir, "queue"), { recursive: true });
    return queue;
  }

  waitingCount(): number {
    return this.waiting.length;
  }

  needsMore(): boolean {
    return this.waiting.length <= this.lowWater;
  }

  mustStopProducing(): boolean {
    return this.waiting.length >= this.highWater;
  }

  isHeld(id: string): boolean {
    return this.held.has(id);
  }

  peekWaiting(): Inspiration[] {
    return this.waiting.map((item) => ({ ...item }));
  }

  peekHeld(): Inspiration[] {
    return [...this.held.values()].map((item) => ({ ...item }));
  }

  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    if (this.mustStopProducing()) return { ok: false, reason: "full" };
    const item: Inspiration = {
      id: `insp-${String(this.nextId).padStart(3, "0")}`,
      direction: input.direction,
      context: input.context,
      ebGeneration: input.ebGeneration,
    };
    this.nextId += 1;
    this.waiting.push(item);
    await this.persist(item, "waiting");
    return { ok: true, id: item.id };
  }

  async claim(): Promise<Inspiration | undefined> {
    const item = this.waiting.shift();
    if (!item) return undefined;
    this.held.set(item.id, item);
    await this.persist(item, "held");
    return { ...item };
  }

  releaseHold(id: string): void {
    this.held.delete(id);
  }

  private async persist(item: Inspiration, state: "waiting" | "held"): Promise<void> {
    const file = path.join(this.runDir, "queue", `${item.id}.json`);
    await writeFile(file, JSON.stringify({ ...item, state }, null, 2), "utf8");
  }
}
