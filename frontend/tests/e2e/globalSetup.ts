import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { E2E_SERVER, REDIS_STATE_PATH } from "./helpers/e2eConfig";

const execFileAsync = promisify(execFile);

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${host}:${port}`);
}

async function waitForHttp(url: string, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPortToClose(host: string, port: number, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isPortOpen(host, port))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${host}:${port} to close`);
}

async function readManagedState() {
  try {
    const rawState = await fs.readFile(REDIS_STATE_PATH, "utf8");
    return JSON.parse(rawState) as { managedPids?: number[] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeManagedState(managedPids: number[]) {
  await fs.writeFile(
    REDIS_STATE_PATH,
    JSON.stringify({ managedPids }, null, 2),
    "utf8"
  );
}

async function terminateProcessGroup(pid: number) {
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

async function cleanupManagedProcesses() {
  const state = await readManagedState();

  for (const pid of [...(state?.managedPids ?? [])].reverse()) {
    await terminateProcessGroup(pid);
  }

  await fs.rm(REDIS_STATE_PATH, { force: true });
}

async function listListeningPids(port: number) {
  try {
    const { stdout } = await execFileAsync("bash", [
      "-lc",
      `lsof -tiTCP:${port} -sTCP:LISTEN || true`,
    ]);

    return stdout
      .split(/\s+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

async function getProcessGroupId(pid: number) {
  try {
    const { stdout } = await execFileAsync("bash", [
      "-lc",
      `ps -o pgid= -p ${pid} | tr -d ' '`,
    ]);
    const pgid = Number(stdout.trim());
    return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
  } catch {
    return null;
  }
}

async function ensurePortAvailable(host: string, port: number) {
  if (!(await isPortOpen(host, port))) {
    return;
  }

  const pids = await listListeningPids(port);
  const processGroups = new Set<number>();

  for (const pid of pids) {
    const pgid = await getProcessGroupId(pid);

    if (pgid) {
      processGroups.add(pgid);
      continue;
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw error;
      }
    }
  }

  for (const pgid of Array.from(processGroups)) {
    await terminateProcessGroup(pgid);
  }

  if (pids.length > 0) {
    await waitForPortToClose(host, port, 15_000);
    return;
  }

  throw new Error(`Port ${port} is already in use and could not be reclaimed`);
}

async function spawnManagedProcess(options: {
  label: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}) {
  const logPath = path.join(path.dirname(REDIS_STATE_PATH), `${options.label}.log`);
  const stdoutHandle = await fs.open(logPath, "w");
  const stderrHandle = await fs.open(logPath, "a");
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", stdoutHandle.fd, stderrHandle.fd],
  });

  await stdoutHandle.close();
  await stderrHandle.close();
  child.unref();

  if (typeof child.pid !== "number") {
    throw new Error(`Failed to start ${options.label}`);
  }

  return child.pid;
}

export default async function globalSetup() {
  await fs.mkdir(path.dirname(REDIS_STATE_PATH), { recursive: true });
  const frontendDir = process.cwd();
  const backendDir = path.resolve(frontendDir, "../backend");
  const managedPids: number[] = [];

  try {
    await cleanupManagedProcesses();
    await ensurePortAvailable(E2E_SERVER.host, E2E_SERVER.backendPort);
    await ensurePortAvailable(E2E_SERVER.host, E2E_SERVER.frontendPort);

    if (!(await isPortOpen(E2E_SERVER.host, E2E_SERVER.redisPort))) {
      const redisPid = await spawnManagedProcess({
        label: "redis",
        command: "redis-server",
        args: [
          "--port",
          String(E2E_SERVER.redisPort),
          "--save",
          "",
          "--appendonly",
          "no",
        ],
        cwd: frontendDir,
        env: process.env,
      });

      managedPids.push(redisPid);
      await writeManagedState(managedPids);
      await waitForPort(E2E_SERVER.host, E2E_SERVER.redisPort, 15_000);
    }

    const backendPid = await spawnManagedProcess({
      label: "backend",
      command: "pnpm",
      args: ["dev"],
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: "development",
        BACKEND_PORT: String(E2E_SERVER.backendPort),
        REDIS_HOST: E2E_SERVER.host,
        REDIS_PORT: String(E2E_SERVER.redisPort),
        CORS_ORIGIN: E2E_SERVER.frontendUrl,
        DISABLE_JOIN_RATE_LIMIT: "1",
      },
    });
    managedPids.push(backendPid);
    await writeManagedState(managedPids);
    await waitForHttp(`${E2E_SERVER.backendUrl}/health`, 120_000);

    const frontendPid = await spawnManagedProcess({
      label: "frontend",
      command: "pnpm",
      args: [
        "exec",
        "next",
        "dev",
        "-H",
        E2E_SERVER.host,
        "-p",
        String(E2E_SERVER.frontendPort),
      ],
      cwd: frontendDir,
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_PUBLIC_API_URL: E2E_SERVER.backendUrl,
      },
    });
    managedPids.push(frontendPid);
    await writeManagedState(managedPids);
    await waitForHttp(`${E2E_SERVER.frontendUrl}/api/health`, 180_000);
  } catch (error) {
    for (const pid of managedPids.reverse()) {
      await terminateProcessGroup(pid).catch(() => undefined);
    }
    await fs.rm(REDIS_STATE_PATH, { force: true });
    throw error;
  }
}
