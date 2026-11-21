import { spawnSync } from "node:child_process";
import path from "node:path";

const temp = path.join(process.cwd(), ".tmp");
const env = { ...process.env, TMP: temp, TEMP: temp };

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["tsc", "--noEmit"]);
run("npx", ["vite", "build"]);
