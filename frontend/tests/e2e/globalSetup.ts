import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { E2E_SERVER, REDIS_STATE_PATH } from "./helpers/e2eConfig";

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
      },
    });
    managedPids.push(backendPid);
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
    await waitForHttp(`${E2E_SERVER.frontendUrl}/api/health`, 180_000);

    await fs.writeFile(
      REDIS_STATE_PATH,
      JSON.stringify({ managedPids }, null, 2),
      "utf8"
    );
  } catch (error) {
    for (const pid of managedPids.reverse()) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Ignore partial startup cleanup failures.
      }
    }
    throw error;
  }
}
