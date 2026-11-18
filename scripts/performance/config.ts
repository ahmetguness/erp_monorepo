import { PERFORMANCE_STAGES, type PerformanceFixture, type PerformanceProfile, type PerformanceStage } from '../../packages/types/src/performance.js';
import { integer, object, string } from './validation.js';

export interface LoadConfig { origin: string; profile: PerformanceProfile; stage: PerformanceStage; users: number; rampSeconds: number; warmupSeconds: number; seconds: number; thinkMs: number; requestTimeoutMs: number }
export function loadConfig(env: NodeJS.ProcessEnv): LoadConfig {
  const origin = new URL(env.PERF_ORIGIN ?? '');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('PERF_ORIGIN must be an explicit origin without credentials.');
  const stage = env.PERF_STAGE ?? 'smoke';
  if (!Object.hasOwn(PERFORMANCE_STAGES, stage)) throw new Error('Unknown performance stage.');
  const profile = env.PERF_PROFILE ?? 'mixed';
  if (!['read', 'write', 'upload', 'realtime', 'mixed', 'soak'].includes(profile)) throw new Error('Unknown performance profile.');
  return {
    origin: origin.origin, profile: profile as PerformanceProfile, stage: stage as PerformanceStage,
    users: PERFORMANCE_STAGES[stage as PerformanceStage], rampSeconds: integer(env.PERF_RAMP_SECONDS, 10, 1, 300),
    warmupSeconds: integer(env.PERF_WARMUP_SECONDS, 5, 1, 300),
    seconds: integer(env.PERF_SECONDS, profile === 'soak' ? 1800 : 30, 10, 86_400),
    thinkMs: integer(env.PERF_THINK_MS, 1000, 100, 60_000), requestTimeoutMs: integer(env.PERF_TIMEOUT_MS, 15_000, 1000, 60_000),
  };
}
export function parseFixture(value: unknown): PerformanceFixture {
  const input = object(value);
  if (input.schemaVersion !== 1 || !Array.isArray(input.actors) || input.actors.length < 3) throw new Error('Expected a phase8 synthetic fixture.');
  const actors: PerformanceFixture['actors'] = input.actors.map((value: unknown): PerformanceFixture['actors'][number] => {
    const actor = object(value); const plan = string(actor.plan);
    if (plan !== 'STARTER' && plan !== 'PROFESSIONAL' && plan !== 'ENTERPRISE') throw new Error('Unknown fixture plan.');
    return { tenantId: string(actor.tenantId), plan, userId: string(actor.userId), token: string(actor.token), contactId: string(actor.contactId), productId: string(actor.productId), warehouseId: string(actor.warehouseId), cashAccountId: string(actor.cashAccountId), taxRateId: string(actor.taxRateId), conversationId: string(actor.conversationId) };
  });
  const runId = string(input.runId);
  if (!/^phase8-[a-f0-9-]{36}$/.test(runId) || new Set(actors.map((actor) => actor.tenantId)).size < 3 || new Set(actors.map((actor) => actor.userId)).size !== actors.length || new Set(actors.map((actor) => actor.plan)).size !== 3) throw new Error('Expected separate synthetic tenants and users covering every plan.');
  return { schemaVersion: 1, runId, actors };
}
