import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { docker, run } from "../disaster-recovery/process.js";
interface StackOptions {
  owner: string;
  network: string;
  privateDirectory: string;
  diagnosticsDirectory: string;
  apiTargets: string[];
  workerTargets: string[];
  metricsToken: string;
}
export class OperationalStack {
  readonly project: string;
  private readonly env: NodeJS.ProcessEnv;
  private constructor(private readonly options: StackOptions) {
    if (!/^axon-(?:perf|dr|ops)-[a-f0-9]{8,12}$/.test(options.owner) ||
      !options.network.startsWith(options.owner))
      throw new Error("Unowned operational stack");
    const local = relative(resolve("artifacts"), resolve(options.privateDirectory));
    if (local.startsWith("..") || isAbsolute(local))
      throw new Error("Private operational configuration must stay inside artifacts");
    for (const target of [...options.apiTargets, ...options.workerTargets])
      if (!target.startsWith(options.owner + "-") ||
        !/^[a-z0-9-]+:\d{2,5}$/.test(target))
        throw new Error("Unowned scrape target");
    this.project = options.owner + "-ops";
    this.env = {
      ...process.env,
      OPS_PROJECT: this.project,
      OPS_PRIVATE_DIR: resolve(options.privateDirectory),
      OPS_APPLICATION_NETWORK: options.network,
      OPS_GRAFANA_PORT: "0",
    };
  }
  static async create(options: StackOptions): Promise<OperationalStack> {
    const stack = new OperationalStack(options);
    await mkdir(options.privateDirectory, { recursive: true, mode: 0o700 });
    await mkdir(resolve(options.privateDirectory, 'alertmanager'), { recursive: true, mode: 0o755 });
    await mkdir(resolve(options.privateDirectory, 'dr-feed'), { recursive: true, mode: 0o755 });
    const files = {
      "metrics-token": options.metricsToken,
      "grafana-password": randomBytes(32).toString("base64url"),
      "api-targets.json": JSON.stringify([{ targets: options.apiTargets }]),
      "worker-targets.json": JSON.stringify([
        { targets: options.workerTargets },
      ]),
      "dr-targets.json": JSON.stringify([
        { targets: [stack.project + "-sink:9002"] },
      ]),
      // Local delivery stays inside this owned network. No email/external messages.
      "alertmanager/alertmanager.yml": JSON.stringify({
        global: { resolve_timeout: "30s" },
        route: {
          receiver: "local-evidence",
          group_by: ["alertname", "service", "severity"],
          group_wait: "5s",
          group_interval: "15s",
          repeat_interval: "4h",
        },
        receivers: [
          {
            name: "local-evidence",
            webhook_configs: [
              {
                url: `http://${stack.project}-sink:9002/alerts`,
                send_resolved: true,
              },
            ],
          },
        ],
      }),
    };
    for (const [name, content] of Object.entries(files))
      await writeFile(resolve(options.privateDirectory, name), content, {
        // Parent stays 0700 on POSIX; each non-root service receives only its
        // individual read-only files, not the other services' credentials.
        mode: 0o644,
        flag: "wx",
      });
    return stack;
  }
  private async compose(args: string[]): Promise<void> {
    const result = await run("docker", ["compose", "-f", resolve("deploy/observability/compose.yml"), ...args], undefined, this.env);
    if (result.code !== 0) {
      const directory = resolve(this.options.diagnosticsDirectory);
      const local = relative(resolve("artifacts"), directory);
      if (local.startsWith("..") || isAbsolute(local))
        throw new Error("Unsafe operational diagnostics directory");
      await writeFile(resolve(directory, `compose-${args[0]}-${Date.now()}.log`), result.stdout + "\n" + result.stderr, { mode: 0o600 });
      throw new Error("Operational compose command failed; inspect restricted stack diagnostics");
    }
  }
  async start(): Promise<void> {
    await this.compose(["config", "--quiet"]);
    await docker([
      "run",
      "-d",
      "--init",
      "--name",
      this.project + "-sink",
      "--label",
      "com.axon.observability=" + this.project,
      "--network",
      this.options.network,
      "--cpus",
      "0.25",
      "--memory",
      "256m",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--mount",
      `type=bind,source=${resolve("scripts/observability/notification-sink.ts")},target=/sink.ts,readonly`,
      "--mount",
      `type=bind,source=${resolve(this.options.privateDirectory, 'dr-feed')},target=/run/axon,readonly`,
      "node:22-bookworm-slim",
      "node",
      "--experimental-strip-types",
      "/sink.ts",
    ]);
    await this.compose(["up", "-d", "--no-build"]);
  }
  async resourceSnapshot(): Promise<string> {
    const names = (await docker(['ps', '--filter', 'label=com.axon.observability=' + this.project, '--format', '{{.Names}}'])).split('\n').filter(Boolean);
    if (names.some(name => !name.startsWith(this.project + '-')))
      throw new Error('Unowned monitoring resource');
    return names.length ? docker(['stats', '--no-stream', '--format', '{{json .}}', ...names]) : '';
  }
  async storageSnapshot(): Promise<string> {
    const volumes = (await docker(['volume', 'ls', '--filter', 'label=com.axon.observability=' + this.project, '--format', '{{.Name}}'])).split('\n').filter(Boolean);
    if (!volumes.length || volumes.some(name => !name.startsWith(this.project + '_')))
      throw new Error('Unowned monitoring volume');
    const program = "const fs=require('node:fs');let files=0,bytes=0,allocatedBytes=0;const pending=process.argv.slice(1);while(pending.length){const path=pending.pop();const st=fs.lstatSync(path);if(st.isSymbolicLink())throw Error('Unexpected volume symlink');if(st.isDirectory()){for(const entry of fs.readdirSync(path))pending.push(path+'/'+entry)}else if(st.isFile()){if(++files>100000)throw Error('Volume measurement budget exceeded');bytes+=st.size;allocatedBytes+=st.blocks*512}}process.stdout.write(JSON.stringify({files,bytes,allocatedBytes}))";
    // Service-owned directories can be 0700. The short-lived metadata walker
    // needs read/search permission; every owned data volume remains read-only.
    const result = await run('docker', ['run', '--rm', '--name', this.project + '-measure', '--label', 'com.axon.observability=' + this.project, '--network', 'none', '--cpus', '0.25', '--memory', '64m', '--read-only', '--cap-drop', 'ALL', '--cap-add', 'DAC_READ_SEARCH', '--security-opt', 'no-new-privileges:true', ...volumes.flatMap((name, index) => ['--mount', `type=volume,src=${name},dst=/v${index},readonly`]), 'node:22-bookworm-slim', 'node', '-e', program, ...volumes.map((_, index) => '/v' + index)]);
    await writeFile(resolve(this.options.diagnosticsDirectory, 'phase10-storage-measurement.log'), result.stdout + '\n' + result.stderr);
    if (result.code !== 0) throw new Error('Owned monitoring storage measurement failed; inspect saved metadata-only diagnostics');
    return result.stdout;
  }
  async stop(): Promise<void> {
    const failures: unknown[] = [];
    // Verify every project resource before a compose volume removal.
    for (const kind of ["container", "volume", "network"] as const) {
      const names = (await docker([
        kind,
        "ls",
        ...(kind === "container" ? ["-a"] : []),
        "--filter",
        "label=com.axon.observability=" + this.project,
        "--format",
        kind === "container" ? "{{.Names}}" : "{{.Name}}",
      ]))
        .split("\n")
        .filter(Boolean);
      for (const name of names)
        if (!name.startsWith(this.project + "-") &&
          !name.startsWith(this.project + "_"))
          throw new Error("Operational resource ownership mismatch");
    }
    try {
      await this.compose([
        "down",
        "--volumes",
        "--remove-orphans",
        "--timeout",
        "15",
      ]);
    }
    catch (error) {
      failures.push(error);
    }
    const label = await docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "com.axon.observability"}}',
      this.project + "-sink",
    ]).catch(() => "");
    if (label === this.project) {
      try {
        await docker(["rm", "-f", this.project + "-sink"]);
      }
      catch (error) {
        failures.push(error);
      }
    }
    else if (label)
      throw new Error("Notification sink ownership mismatch");
    if (failures.length)
      throw new AggregateError(failures, 'Owned monitoring cleanup failed');
  }
}
