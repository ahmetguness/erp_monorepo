# ERP operations runbooks

Scope: platform operators/SRE and authorized system administrators. Tenant administrators may report impact and reconcile their own records; they do not receive infrastructure credentials, cross-tenant telemetry, backup keys, SQL write access or restore authority. Grafana is a separate authenticated operations surface. There is no tenant-facing physical restore button.

## Incident lifecycle

1. Acknowledge the Alertmanager fingerprint, severity, service and UTC start time. Assign an incident commander and a technical owner through the organization's incident channel. This repository does not invent on-call assignments or claim an external notification destination is configured.
2. Establish affected replicas, workflows and time window. Use authenticated application/operations tools to determine tenant impact. Prometheus labels deliberately contain no tenant/user/request/object identifiers. Do not paste customer data or credentials into tickets.
3. Save bounded, access-controlled evidence: alert firing/resolution, PromQL, canonical route, safe error code and trace ID. Loki: `{service=~"axon-api|axon-worker"} | json | traceId="<trace>"`. Open the same ID in Tempo. Bodies, authorization and financial values are excluded. A killed process cannot emit its own final span; use scrape failure, supervisor logs and a recovery request's trace instead.
4. Prefer the least disruptive mitigation below. Financial mutations with uncertain outcomes require reconciliation using the original idempotency key. Never change quota, disable tenant checks, weaken audit triggers, delete a dead-letter row or label an error successful.
5. Verify readiness, independent SQL invariants, audit integrity, queues and an authorized real ERP read/write. Wait for a **delivered resolved** notification; a green UI alone is insufficient. Record RPO/RTO and any unreconciled data.
6. Escalate critical integrity/security/data-loss events immediately to the security lead and responsible domain owner. Notify affected customers through the approved channel with verified scope, start time, mitigation and next update time; do not speculate about lost data. Only authorized staff send external messages.
7. Within the organization's incident-review window, record timeline, root cause, contributing factors, customer impact, recovery evidence, owners and dated corrective actions. Retain the incident evidence under the approved access/retention policy.

Alert windows, severities and thresholds are generated from `scripts/observability/configuration.ts`. Do not shorten windows to make a drill pass. Counter-based five-minute alerts resolve after the complete window has cleared. Scrape/probe failures mean **unknown**, never zero violations.

## API replica

**Signal:** `ApiReplicaDown`, `up{job="axon-api"} == 0` for 30s. Affects traffic assigned to the failed replica. Check Caddy upstream health, container exit/OOM state, deployment digest and other replicas. Query HTTP throughput/5xx, resident memory and event-loop p99; correlate the last successful trace and startup JSON logs. Drain/restart only the failed replica using the immutable approved image. Roll back the release if the failure repeats; keep schema compatibility requirements from Phase 7. Verify readiness and a real authenticated workflow after restart. Escalate unavailable capacity to the platform owner; apply the shared communication/postmortem process.

## API errors

**Signals:** `ApiErrorBudget` (>0.5% 5xx), `ApiReadLatency` (>300ms p95), `ApiWriteLatency` (>800ms p95). PromQL uses histogram buckets summed across replicas before `histogram_quantile`; never average replica percentiles. Identify canonical route/method, dependency latency and error codes. Tempo: HTTP → application → database/provider spans. Exclude `/metrics` when diagnosing business reads. Mitigate a bad release or constrained dependency, not by raising SLOs/retries/timeouts. Roll back the compatible application image when warranted. Reconcile ambiguous writes before retry. Escalate finance/stock impacts to their domain owners.

## PostgreSQL

**Signals:** `PostgresProbeFailure`, `PostgresContention`. Affects all tenants using that database. Check database/container/network readiness, `pg_stat_activity`, connection counts, lock waiters, oldest transaction, deadlocks and Prisma pool timeout increments. Query text/bind values are not exported into telemetry. Read-only diagnostics must have statement/lock deadlines. An unresponsive transport retains at most one in-flight probe and reports failure after the application deadline. Restore connectivity or roll back the responsible release. Do not terminate financial transactions indiscriminately or increase connection pools beyond the Phase 8.2 budget. If storage/WAL corruption is suspected, freeze writes and follow Phase 9 new-target restore procedures. Confirm probe recovery, journal/stock/idempotency invariants and real HTTP recovery before closing.

## Redis

**Signal:** `RedisUnavailable` from the bounded readiness check. Affects distributed rate limiting and worker heartbeat. Check network, container exit, memory/eviction policy and Redis PING without printing connection credentials. Diagnose readiness HTTP traces and structured operational errors. Restore the existing service/network; do not silently substitute an unbounded per-process limiter in production. Verify heartbeat and limits after recovery. Escalate recurring data/coordination loss to the platform/security owners.

## Worker

**Signals:** `WorkerUnavailable`, `OutboxBacklog` (>30s oldest), `OutboxExpiredLease`. Affects queued consumers, not proof of a failed financial database commit. Inspect process health, Redis heartbeat, pending/processing/failed counts, oldest age and delivery duration. Follow the persisted traceparent from HTTP mutation into `outbox.deliver` and provider spans. Restart the compatible worker; let bounded lease recovery reclaim expired work. Preserve consumer receipts and idempotency. Never mark work processed manually. If queue age continues to rise, isolate a failing provider, stop unsafe bulk replay and escalate to its owner. Close only after real consumer receipts, queue health and delivered resolution are verified.

## Dead letter

**Signal:** `OutboxDeadLetter` for domain or marketplace work. Diagnose the safe stored failure classification, event version and failed consumer; use restricted tenant-authorized tooling for identifiers. Confirm whether an external side effect already occurred. Fix the provider/configuration/code, then use the authorized replay API with unchanged event identity. Observe the real worker transition to PROCESSED and its receipt. Do not remove receipts, reset all attempts or bulk-replay unknown payment outcomes. A still-failing replay remains an incident. Escalate to the consumer/domain owner.

## Provider

**Signal:** `ProviderFailure` for network/timeout, 429 or 5xx counters. Affects workflows using that fixed provider category. Compare provider latency/status, outbox age and the failed `provider.request` span; no full URL/query/signature/body is exported. Respect provider rate limits and bounded existing backoff. Restore credentials/network/provider health or pause the affected worker using the approved procedure. Do not retry ambiguous finance effects with a new key. Keep upload cleanup markers when remote deletion is uncertain. Verify an actual successful workflow and full five-minute counter-window resolution; provider fixture success does not certify the commercial provider.

## WebSocket

**Signals:** `WebSocketFailure`, `RealtimeUnconfirmedDelivery`. Check active connections, transport failure count, receipt-enabled connections, pending/unconfirmed/overflow counts and ACK latency. A receipt measures server event creation to server receipt of client ACK, not browser one-way latency. Legacy clients are untracked and are never counted as confirmed. Inspect `websocket.disconnect` traces/logs and original HTTP upgrade trace. Restore network/gateway health; clients reconnect with capped backoff, invalidate/refetch authoritative data and stop on authorization failures. Do not claim loss-free delivery from a successful TCP send. Verify durable event delivery to every expected authorized recipient and absence of foreign-tenant frames. Escalate persistent missing receipts to chat/platform owners.

## Storage

**Signals:** `StorageUnavailable`, `StorageCleanupExhausted`, `StorageMetadataMismatch`. Check bucket HEAD readiness, provider spans, used/reserved bytes by plan, durable reservation status and cleanup attempts. SQL metadata reconciliation compares committed ERP/chat bytes to accounting; it does not prove remote object identity/checksum. Run the restricted Phase 8.2/9 object manifest/recovery checks for that proof. Restore provider access, keep usage → reservation lock order and existing quota limits. Preserve durable cleanup leases and ambiguous commit safety; never delete a possibly committed object. Exhausted cleanup requires scoped, audited inspection before bounded recovery. Escalate unexplained byte/object mismatches to storage/security owners; verify quotas, manifests and no pending orphan work before closure.

## Backup

**Signals:** `BackupFailure` (failed attempt/repository inaccessible/full backup older than 26h), `DrFeedMissing` (probe failure or feed older than 120s). A previous successful backup does not cancel a newer failed attempt. Check supervisor exit, scheduler JSON events, protected attempt-state metrics, pgBackRest info/check/verify, repository IAM/mount and escrow availability without exposing key material. The backup loop exits on failure; the supervisor must restart/escalate according to the approved policy. Restore repository access or credentials through the rotation procedure. Run and verify a **new successful backup**, then an owned new-target restore drill; never overwrite the source database or use `--delta`. Clear failed-attempt state only after actual successful completion. Escalate RPO/RTO exposure to the DR owner and incident commander. The local bridge in the drill is not a production scheduler/independent collector deployment.

## WAL archive

**Signal:** `WalArchiveStale` (>900s freshness or unrecovered archive failure). Confirm `pg_stat_archiver` last success/failure, archive_command configuration, repository accessibility and disk pressure. Compare database and collector UTC clocks. Restore the approved archive command/provider and verify actual new segment shipping with pgBackRest check; do not falsify timestamps or disable archiving to silence the alarm. If WAL retention threatens disk capacity, escalate immediately and follow the Phase 9 continuity procedure. Verify the recovery chain and new-target PITR before claiming RPO restored. The owned drill measures a real archive failure and 901.49 seconds of archive age without clock changes; the 900-second threshold remains unchanged. The archive-failure branch can correctly fire before the age threshold.

## Business invariants

**Signal:** `BusinessInvariantViolation` from independent read-only SQL: tenant references, negative stock, journal balance, duplicate posting/payment/idempotency and reservation accounting. Stop the affected write workflow; preserve evidence and immediately involve the finance/inventory/security owner. Use restricted read-only SQL and known-good source records to establish exact tenant and time boundaries. Never globally adjust balances, disable tenant filters, rewrite journals or delete duplicate rows to silence metrics. Recover through authorized compensating domain operations or a verified new-target PITR and reconciliation plan. Compare business totals and expected acknowledged writes; any lost acknowledged transaction is a separate incident. Reopen traffic only after independent invariants and owner approval.

## Audit integrity

**Signal:** `AuditIntegrityFailure`. Treat as a security/integrity incident; freeze privileged changes and preserve the compromised source/repository read-only. Inspect chain verification and trusted checkpoints; missing telemetry or a verification budget failure is unknown, not valid. Keep append-only triggers active. Do not edit/delete/re-hash historical entries to make the chain green. Restore a verified backup/WAL chain into a fresh owned target at a proven point before corruption, compare acknowledged business effects, isolate/revoke compromised credentials and perform an approved cutover. Audit hash chains are tamper evidence, not signatures against a database superuser with all keys. Escalate immediately to security/DR/legal owners and use the shared customer/postmortem process.

## Authentication

**Signal:** `AuthenticationAnomaly` (>20 failed login/MFA attempts/5m). Check aggregate trends, safe error codes and protected identity/session audit tooling; do not export email/IP labels into Prometheus. Distinguish credential stuffing from an expired session/client release. Preserve rate limiting, lockout and MFA. Revoke affected sessions/keys through audited scoped operations and rotate secrets using staged reader/key recovery procedures. Avoid tenant-wide/global logout without justified incident scope. Escalate suspected compromise to security.

## Payments

**Signal:** `CriticalPaymentWebhookFailure` on server errors. Check canonical endpoint, error trace, journal and payment allocation invariants, external provider acknowledgment and the original idempotency key. Quarantine uncertain work, reconcile provider/database states and replay only using the existing domain contract. Never count HTTP 409/5xx as success or issue a fresh key for an uncertain effect. Escalate to finance and provider owners immediately. Close after reconciled balances, exactly one domain effect and successful webhook/replay evidence.

## EDocument

**Signal:** `EDocumentBacklog` (>300s oldest pending/processing/error document). This is an operational queue-age target, not a legal submission deadline. Check provider availability, durable outbox status, submission idempotency and receipt status. Confirm provider acceptance before resubmitting; do not create a second legal document with a new key. Restore the existing bounded worker/provider path, reconcile acknowledgments and escalate to the e-document owner when unresolved. Legal deadlines must be approved for each jurisdiction/customer.

## Monitoring

**Signal:** `TelemetryLoss`. Check bounded exporter queue, drop/failure counters, scrape success, Loki/Tempo readiness, disk/retention and endpoint configuration. Business transactions continue when diagnostic export fails; mandatory transaction audits must still succeed atomically. Restore collector/backends and verify a new HTTP→DB trace, correlated redacted log and scrape. Dropped telemetry is not replayed by an unbounded retry queue and cannot be retroactively declared present. Record the blind interval and do not publish capacity conclusions based on invalid measurement.

## Clock

**Signal:** `ClockSkew` (>5s database/application offset). Verify NTP/chrony and host/container UTC, not locale display. Inspect database sampled time and collector freshness. Restore host time synchronization through the approved infrastructure procedure; avoid abrupt backward changes during financial/audit activity. Reconcile timestamp/idempotency/audit ordering issues before reopening affected operations. Escalate persistent drift to platform/security owners.

## Notification and access commissioning

The isolated drill delivers real Alertmanager firing/resolution webhooks to an owned local sink. It sends no external email or chat messages. Before staging/pilot, configure the private receiver URL/token file, named on-call routing and escalation policy; test authenticated delivery, deduplication, receiver failure and resolution with the actual operator. Grafana is loopback-published with anonymous access disabled; use a separately authenticated operator access path. Metrics require a bearer token and are never customer-facing. Provision each retention policy, repository capacity alert and off-host failure domain explicitly. Do not expose Tempo/Loki/Prometheus/Alertmanager ports publicly or reuse application/admin secrets as telemetry credentials.
