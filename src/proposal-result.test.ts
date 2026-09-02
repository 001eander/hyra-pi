import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { finishProposalWrite } from "./proposal-result.js";

describe("finishProposalWrite", () => {
  it("keeps a solve.sh that was written before the proposal timed out", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "hyra-pi-prop-"));
    await writeFile(path.join(dir, "solve.sh"), "#!/bin/sh\necho ok\n", "utf8");
    await expect(
      finishProposalWrite(dir, new Error("proposal write timed out after 240000ms")),
    ).resolves.toEqual({ solutionDir: dir });
  });

  it("fails when the timeout happens before solve.sh exists", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "hyra-pi-prop-"));
    await mkdir(dir, { recursive: true });
    await expect(finishProposalWrite(dir, new Error("proposal write timed out after 20ms"))).resolves.toEqual({
      error: "proposal write timed out after 20ms",
    });
  });
});
