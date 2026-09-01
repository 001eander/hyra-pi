import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SandboxPort } from "./inner-loop.js";

export type DockerRun = (
  args: string[],
  opts: { workDir: string; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export function createDockerSandbox(opts: {
  taskDir: string;
  image: string;
  timeoutMs: number;
  docker?: DockerRun;
}): SandboxPort {
  const docker = opts.docker ?? runDocker;
  return {
    async evaluate(solutionDir) {
      const workDir = await mkdtemp(path.join(tmpdir(), "hyra-pi-work-"));
      await cp(solutionDir, path.join(workDir, "solution"), { recursive: true });
      await cp(opts.taskDir, path.join(workDir, "task"), { recursive: true });
      await cp(path.join(opts.taskDir, "eval.sh"), path.join(workDir, "eval.sh"));

      let ran;
      try {
        ran = await docker(
          [
            "run",
            "--rm",
            "--network",
            "none",
            "-v",
            `${workDir}:/work`,
            "-w",
            "/work",
            opts.image,
            "bash",
            "-lc",
            "bash /work/eval.sh /work/solution",
          ],
          { workDir, timeoutMs: opts.timeoutMs },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          score: null,
          log: message.includes("Docker daemon")
            ? `${message}\n请先启动 Docker`
            : message,
        };
      }

      const log = `${ran.stdout}${ran.stderr}`;
      if (ran.code !== 0) {
        return { ok: false, score: null, log };
      }
      try {
        const raw = JSON.parse(await readFile(path.join(workDir, "score.json"), "utf8")) as {
          score: number;
          higher_is_better?: boolean;
          higherIsBetter?: boolean;
          notes?: string;
        };
        return {
          ok: true,
          log,
          score: {
            score: raw.score,
            higherIsBetter: raw.higherIsBetter ?? raw.higher_is_better ?? true,
            notes: raw.notes ?? "",
          },
        };
      } catch {
        return { ok: false, score: null, log: `${log}\nmissing score.json` };
      }
    },
  };
}

function runDocker(
  args: string[],
  opts: { workDir: string; timeoutMs: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`sandbox timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
