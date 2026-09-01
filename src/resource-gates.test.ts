import { describe, expect, it } from "vitest";
import { ResourceGates } from "./resource-gates.js";

describe("ResourceGates", () => {
  it("caps how many proposals can write at once, then frees a slot when one finishes", () => {
    const gates = new ResourceGates({ maxProposals: 2, maxSandboxes: 1 });
    expect(gates.tryStartProposal()).toBe(true);
    expect(gates.tryStartProposal()).toBe(true);
    expect(gates.tryStartProposal()).toBe(false);
    expect(gates.proposalsInFlight()).toBe(2);

    gates.finishProposal();
    expect(gates.proposalsInFlight()).toBe(1);
    expect(gates.tryStartProposal()).toBe(true);
    expect(gates.proposalsInFlight()).toBe(2);
  });

  it("counts sandbox slots separately from proposal slots", () => {
    const gates = new ResourceGates({ maxProposals: 1, maxSandboxes: 2 });
    expect(gates.tryStartProposal()).toBe(true);
    expect(gates.tryStartSandbox()).toBe(true);
    expect(gates.tryStartSandbox()).toBe(true);
    expect(gates.tryStartSandbox()).toBe(false);
    expect(gates.proposalsInFlight()).toBe(1);
    expect(gates.sandboxesInFlight()).toBe(2);
  });

  it("still lets Context start when every proposal slot is taken", () => {
    const gates = new ResourceGates({ maxProposals: 2, maxSandboxes: 2 });
    expect(gates.tryStartProposal()).toBe(true);
    expect(gates.tryStartProposal()).toBe(true);
    expect(gates.tryStartProposal()).toBe(false);

    expect(gates.tryStartContext()).toBe(true);
    expect(gates.contextInFlight()).toBe(true);
    expect(gates.tryStartContext()).toBe(false);

    gates.finishContext();
    expect(gates.contextInFlight()).toBe(false);
    expect(gates.tryStartContext()).toBe(true);
  });
});
