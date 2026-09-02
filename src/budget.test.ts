import { describe, expect, it } from "vitest";
import { parseArgs, parseBudget } from "./budget.js";

describe("parseBudget", () => {
  it("reads a 30 minute cap as 1800000 ms", () => {
    expect(parseBudget("30m", "8")).toEqual({ maxSolutions: 8, maxMs: 1_800_000 });
  });
});

describe("parseArgs", () => {
  it("reads the run command and flags", () => {
    const args = parseArgs(["run", "--task", "./examples/task", "--proposals", "3"]);
    expect(args.get("_")).toBe("run");
    expect(args.get("task")).toBe("./examples/task");
    expect(args.get("proposals")).toBe("3");
  });
});
