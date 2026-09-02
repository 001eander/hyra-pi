import { describe, expect, it } from "vitest";
import { PROPOSAL_TOOLS } from "./pi-agents.js";

describe("PROPOSAL_TOOLS", () => {
  it("does not give Proposal a host bash that can pip-install or scan the disk", () => {
    expect(PROPOSAL_TOOLS).not.toContain("bash");
    expect(PROPOSAL_TOOLS).toEqual(["read", "write", "edit", "ls", "resolve-library-id", "query-docs"]);
  });
});
