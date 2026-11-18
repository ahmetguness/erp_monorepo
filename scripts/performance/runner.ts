import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import type { PerformanceFixture } from '../../packages/types/src/performance.js';
import type { LoadConfig } from './config.js';
import { Measurements } from './measurements.js';
import { WorkloadHTTP } from './http.js';
import { scenario } from './scenarios.js';
import { openRealtime } from './realtime.js';
import { MeasurementContinuity } from './continuity.js';

export async function runWorkload(config: LoadConfig, fixture: PerformanceFixture) {
  const started = performance.now(); const steadyAt = started + (config.rampSeconds + config.warmupSeconds) * 1000;
  const end = steadyAt + config.seconds * 1000;
  const metrics = new Measurements(steadyAt, end); const http = new WorkloadHTTP(config, metrics);
  const eligible = fixture.actors;
  const continuity = new MeasurementContinuity(started, Date.now());
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable(); const cpu = process.cpuUsage(); const rss = process.memoryUsage().rss;
  let peakRss = rss; let sessionsStarted = 0; let cohortReadyAtSteady = 0;
  const progress = setInterval(() => {
    continuity.sample(performance.now(), Date.now());
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    console.info(JSON.stringify({ progressSeconds: Math.round((performance.now() - started) / 1000), profile: config.profile, usersStarted: sessionsStarted, sockets: metrics.sockets, inFlight: metrics.inFlight, violations: metrics.violations }));
  }, 10_000);
  try {
    await Promise.all(Array.from({ length: config.users }, async (_, index) => {
      await pause(index / config.users * config.rampSeconds * 1000);
      const actor = eligible[index % eligible.length]; const foreign = fixture.actors.find((value) => value.tenantId !== actor.tenantId);
      if (!foreign) throw new Error('Isolation workload requires separate tenants.');
      sessionsStarted++;
      let close: (() => Promise<void>) | undefined;
      if (config.profile === 'realtime' || ((config.profile === 'mixed' || config.profile === 'soak') && index % 5 === 0)) {
        try { close = await openRealtime(config.origin, actor, index, metrics); } catch { metrics.scenarioFailures++; return; }
      }
      if (performance.now() <= steadyAt) cohortReadyAtSteady++;
      try {
        for (let iteration = 0; performance.now() < end; iteration++) {
          try { await scenario(config.profile, http, actor, foreign, index, iteration); }
          catch { if (performance.now() >= steadyAt) metrics.scenarioFailures++; }
          if (metrics.violations) break;
          await pause(config.thinkMs);
        }
      } finally { if (close) { await pause(5000); await close(); } }
    }));
  } finally { continuity.sample(performance.now(), Date.now()); clearInterval(progress); loop.disable(); }
  const elapsed = (performance.now() - started) / 1000; const cpuUsed = process.cpuUsage(cpu); const snapshot = metrics.snapshot();
  const endpoints = Object.values(snapshot.endpoints); const total = endpoints.reduce((sum, value) => sum + value.requests, 0);
  const serverErrors = endpoints.reduce((sum, value) => sum + value.serverErrors + value.transportErrors, 0);
  const expectedSockets = config.profile === 'realtime' ? config.users : config.profile === 'mixed' || config.profile === 'soak' ? Math.ceil(config.users / 5) : 0;
  const connectionsValid = !expectedSockets || (snapshot.maximumSockets === expectedSockets && snapshot.socketFailures === 0 && snapshot.pongs > 0);
  const deliveryValid = !expectedSockets || (snapshot.messages > 0 && snapshot.delivery.p95Ms < 2000 && snapshot.verifiedDelivery.count > 0 && snapshot.verifiedDelivery.p95Ms < 2000);
  const messagesValid = !expectedSockets || (snapshot.messageProof.acceptedMessages > 0 && snapshot.messageProof.unconfirmedReceipts === 0 && snapshot.messageProof.trackingOverflows === 0);
  const slo = {
    reads: endpoints.some((row) => row.kind === 'read') && endpoints.filter((row) => row.kind === 'read').every((row) => row.latency.p95Ms < 300),
    writes: endpoints.filter((row) => row.kind === 'write').every((row) => row.latency.p95Ms < 800),
    serverErrorRate: total > 0 && serverErrors / total < 0.005,
    successfulWorkflows: snapshot.scenarioFailures === 0 && endpoints.every((row) => row.failed === 0),
    tenantIsolation: snapshot.violations === 0,
    realtime: connectionsValid && deliveryValid && messagesValid,
    realtimeConnections: connectionsValid, realtimeDelivery: deliveryValid, realtimeMessages: messagesValid,
    soakDuration: config.profile !== 'soak' || config.seconds >= 1800,
  };
  const measurementValid = continuity.valid && cohortReadyAtSteady === config.users && loop.percentile(99) / 1_000_000 < 100;
  return { config, sessionsStarted, cohortReadyAtSteady, measurementValid, elapsedSeconds: elapsed, measuredSeconds: config.seconds, requestsPerSecond: total / config.seconds, ...snapshot, failureSamples: http.failureSamples, generator: { cpuSeconds: (cpuUsed.user + cpuUsed.system) / 1_000_000, peakRssBytes: peakRss, startRssBytes: rss, endRssBytes: process.memoryUsage().rss, eventLoopP99Ms: loop.percentile(99) / 1_000_000, maximumProgressGapMs: continuity.maximumGapMs }, slo, passed: measurementValid && Object.values(slo).every(Boolean) };
}
