import { spawn } from "node:child_process";
import path from "node:path";

/** Runs a binary without a shell (arguments are never interpreted) and returns its stdout. */
export function runProcess(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolve(stdout);
      const reason = code === null ? `por la señal ${signal}` : `con código ${code}`;
      reject(new Error(`${path.basename(binary)} terminó ${reason}: ${stderr.trim().slice(-800)}`));
    });
  });
}
