import { access } from "node:fs/promises";
import path from "node:path";

export async function finishProposalWrite(
  workDir: string,
  err?: unknown,
): Promise<{ solutionDir: string } | { error: string }> {
  const solve = path.join(workDir, "solve.sh");
  try {
    await access(solve);
  } catch {
    return {
      error: err instanceof Error ? err.message : err ? String(err) : "missing solve.sh",
    };
  }
  if (!err) return { solutionDir: workDir };
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("timed out")) return { solutionDir: workDir };
  return { error: message };
}
