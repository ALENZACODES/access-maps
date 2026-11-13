import { spawnSync } from "node:child_process";

export function listZip(zipPath: string): string[] {
  const result = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`unable to list ${zipPath}: ${result.stderr}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function readZipText(zipPath: string, entry: string): string {
  const result = spawnSync("unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`unable to read ${entry} from ${zipPath}: ${result.stderr}`);
  }
  return result.stdout.charCodeAt(0) === 0xfeff ? result.stdout.slice(1) : result.stdout;
}

export function findZipEntry(entries: string[], fileName: string): string | null {
  const target = fileName.toLowerCase();
  return (
    entries.find((entry) => {
      const base = entry.split("/").pop()?.toLowerCase() ?? "";
      return base === target;
    }) ?? null
  );
}
