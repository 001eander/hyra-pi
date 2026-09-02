import { describe, expect, it } from "vitest";
import { parseArgs, parseBudget, parseProposalMs, parseSandboxMs } from "./budget.js";

describe("parseBudget", () => {
  it("reads a 30 minute cap as 1800000 ms", () => {
    expect(parseBudget("30m", "8")).toEqual({ maxSolutions: 8, maxMs: 1_800_000 });
  });
});

describe("parseSandboxMs", () => {
  it("defaults to 30 minutes and lets --sandbox override the env", () => {
    expect(parseSandboxMs(undefined, undefined)).toBe(1_800_000);
    expect(parseSandboxMs(undefined, "900000")).toBe(900_000);
    expect(parseSandboxMs("30m", "900000")).toBe(1_800_000);
  });
});

describe("parseProposalMs", () => {
  it("defaults to 30 minutes and lets --write override the env", () => {
    expect(parseProposalMs(undefined, undefined)).toBe(1_800_000);
    expect(parseProposalMs(undefined, "360000")).toBe(360_000);
    expect(parseProposalMs("30m", "360000")).toBe(1_800_000);
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
