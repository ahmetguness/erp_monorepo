# ERP operational telemetry

This stack is opt-in. It does not replace the application deployment or grant
tenant admins infrastructure access. The owned local tools create disposable
Docker projects and synthetic databases; they reject existing application targets.

## Reproduce local evidence

From the repository root, with Docker Desktop running and dependencies installed:

```powershell
npm run observability:build
npm run observability:generate
npm run observability:integration
npm run observability:regression
npm run test:web-quality
npm run test:web-session
npm run observability:drill
```

Run integration/cross-module checks after image builds have finished. Do not run
the root typecheck (which rebuilds `@repo/types`) alongside host unit or database
tests. Do not run CPU-intensive builds/tests during capacity measurements.
`test:web-session` measures 25 minutes; the incident drill deliberately waits for
the unchanged 900-second WAL delay and full counter alert resolution windows.
Closing the host/Docker invalidates incomplete runs; it does not produce a PASS.

`observability:build` builds API/worker, migrator, production Next web, DR and a
test-only browser image. The latter pins the Playwright base digest, adds Openbox
and Xvfb, and matches the installed Playwright version. Browser tests use an
isolated virtual display; they open no host desktop window. The window manager
allows actual minimize/visibility lifecycle and final Web Vitals delivery.
The driver has no production role. Its root/sandbox settings apply only to trusted
owned synthetic pages, with dropped capabilities, read-only filesystem, bounded
tmpfs/memory/CPU and only the fixture/source/report mounts it needs.

Artifacts are under `artifacts/disaster-recovery/axon-dr-*/` and
`artifacts/phase10-*.log`. Each successful harness removes its own labeled
containers, networks, volumes and private fixture files. Preserve failure
artifacts; inspect the final JSON and cleanup state, not just an intermediate
console line. `docs/phase-10*.md` record scope, outcomes and remaining gates.

### Phase 8.2 resource budget with telemetry

After the correctness runs have finished and removed their resources, the
following runs the mixed 25/50/75/100 VU discovery and a real 1800-second soak
at the highest passing stage. Stop other builds and lab workloads first.

```powershell
$env:PERF_SKIP_BUILD = 'true'
$env:PERF_BACKEND_IMAGE = 'axon-performance-backend:phase10'
$env:PERF_MIGRATOR_IMAGE = 'axon-performance-migrator:phase10'
$env:PERF_WEB_IMAGE = 'axon-performance-web:phase10'
$env:PERF_API_REPLICAS = '4'
$env:PERF_API_POOL = '5'
$env:PERF_WORKER_CPU = '2'
$env:PERF_WORKER_INTERVAL_MS = '250'
$env:PERF_PROXY_CPU = '0.5'
$env:PERF_PROXY_MEMORY_MIB = '256'
$env:PERF_GENERATOR_CPU = '2'
$env:PERF_GENERATOR_MEMORY_MIB = '1536'
$env:PERF_TENANT_GROUPS = '50'
$env:PERF_USERS_PER_TENANT = '5'
$env:PERF_PROFILES = 'mixed'
$env:PERF_STAGES = 'smoke,probe50,probe75,baseline'
$env:PERF_SECONDS = '90'
$env:PERF_RAMP_SECONDS = '10'
$env:PERF_WARMUP_SECONDS = '5'
$env:PERF_THINK_MS = '1000'
$env:PERF_DIAGNOSTICS = 'false'
$env:PERF_CPU_PROFILE = 'false'
$env:PERF_SKIP_SOAK = 'false'
$env:PERF_SOAK_SECONDS = '1800'
$env:PERF_TELEMETRY_MODE = 'on'
Remove-Item Env:PERF_SOAK_STAGE -ErrorAction SilentlyContinue
npm run performance:local
```

The short cost comparison uses `PERF_STAGES=smoke`, `PERF_SKIP_SOAK=true` and
separate fresh runs with telemetry `off` and `on`. Off retains local Phase10
instrumentation. Comparing the same workload against a separately preserved
previous-version backend measures the combined local instrumentation/runtime
change; do not overwrite or edit a working tree to obtain that baseline.

With telemetry on, every sampled API and worker must report a successful
independent probe and zero exporter failures/drops throughout each stage.
Successful trace **and** log exports are required at the end. A missing or failed
measurement cannot establish capacity. Read/write/WS/queue SLOs remain unchanged;
a failing higher discovery stage still yields exit code 2, even if a lower soak
passes. Read each stage and its cleanup evidence instead of treating that exit
as either a universal success or a universal outage.

The final Phase10 regression explicitly pins `PERF_SOAK_STAGE=probe75` after
the earlier 100 VU attempt exceeded the unchanged queue-age SLO before a host
interruption. It still runs all four short discovery stages and records their
individual results. A short 100 VU pass alone cannot establish sustained 100 VU
capacity. See the report's exact run IDs and frozen image digests.

## Application configuration

- `TELEMETRY_ENABLED=true`, `TELEMETRY_SAMPLE_RATIO=0.1` and
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://tempo:4318/v1/traces` enable bounded
  OTLP/HTTP JSON traces. The endpoint must contain no embedded credentials,
  query or fragment. The generic OTLP/metrics placeholders in the environment
  catalog do not enable a separate metrics exporter; metrics use Prometheus.
- `LOG_EXPORT_ENDPOINT=http://loki:3100/loki/api/v1/push` enables the bounded,
  already-redacted diagnostic log stream. Production stdout remains JSON even
  if a pretty format was accidentally requested. Domain audits stay in their
  existing transactional database path.
- Configure a dedicated random `METRICS_BEARER_TOKEN` of at least 32 characters
  for API/worker. Unset/weak credentials fail closed in every environment.
  Prometheus reads its token from a private mounted file. Never place it in
  dashboard JSON, a target URL, Git or a public reverse-proxy route.
- DR uses the independent read-only collector and the dedicated numeric metrics
  volume described in `../dr/README.md`. ERP gets no repository/cipher access.
- `READINESS_STORAGE_PROBE` only opts the synthetic non-production fixture into
  provider readiness; production storage readiness is already required.

Telemetry timeouts, bounded queues and drop counters protect business requests
when a diagnostic backend is down. They do not promise durable diagnostic log
delivery. Review exported/dropped/configuration counters and the independent
collector before treating missing evidence as healthy.

## Deployment review

`compose.yml` uses digest-pinned services, private monitoring/application networks,
service-specific read-only configuration, bounded Docker logs, resource caps and
anonymous-disabled Grafana. `OperationalStack` provisions owned local target
files, bearer/admin secrets and a **local notification test sink**. It is not a
production secret manager or an external on-call integration.

Before adoption, the platform owner must configure approved scrape targets,
credential delivery/rotation, management network/TLS, Grafana roles, real
Alertmanager receiver, escalation and resolution delivery. Test the receiver
from an independent failure domain. Review storage encryption, off-host backup,
clock synchronization, monitoring storage capacity and operator access. Never
copy synthetic credentials, host trust authentication or local sink endpoints
into a customer deployment. POSIX file modes in these tools do not establish
Windows NTFS permissions.

Default retention is Prometheus 7 days/1 GB, Loki 7 days and Tempo 72 hours;
Docker JSON logs are 10 MB × 3. These are operational defaults, not legal
retention approval or a measured multi-day deletion certificate. Check the
governance report and organization policy before changing retention.

Every alert links to `docs/operations-runbooks.md`. Counter alerts intentionally
wait for their real lookback windows before resolution. Missing/stale probes are
unknown/failure; do not replace them with invented zero values or lower Phase 8.2
SLOs to make a dashboard green. The local sink proves local HTTP delivery only.

Rollback disables optional exporters/scrapes and removes only the approved
monitoring stack after preserving required incident evidence. It does not modify
financial/stock data, audit history, outbox delivery receipts or backup chains.
