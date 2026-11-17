export const RELEASE_PROTOCOL = {
  manifest: 1,
  apiContract: 1,
  minimumApiContract: 1,
  eventSchema: 2,
  minimumEventSchema: 1,
  featureFlags: 1,
} as const;

export interface ReleaseIdentity {
  version: string;
  gitSha: string;
  apiContractVersion: number;
  eventSchemaVersion: number;
  featureFlagVersion: number;
}

export function releaseIdentity(env: Readonly<Record<string, string | undefined>>): ReleaseIdentity {
  return {
    version: env.RELEASE_VERSION ?? 'development',
    gitSha: env.RELEASE_GIT_SHA ?? 'development',
    apiContractVersion: RELEASE_PROTOCOL.apiContract,
    eventSchemaVersion: RELEASE_PROTOCOL.eventSchema,
    featureFlagVersion: RELEASE_PROTOCOL.featureFlags,
  };
}
