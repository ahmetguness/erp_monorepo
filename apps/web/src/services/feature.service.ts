import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

const ResolvedFeatureSchema = z.object({
  featureKey: z.string(),
  value: z.string(),
  isEnabled: z.boolean(),
  type: z.enum(['BOOLEAN', 'LIMIT', 'ENUM']),
  isOverride: z.boolean(),
});

const ResolvedFeaturesResponseSchema = SingleResponseSchema(z.array(ResolvedFeatureSchema));

export type ResolvedFeature = z.infer<typeof ResolvedFeatureSchema>;

export async function getResolvedFeatures(): Promise<ResolvedFeature[]> {
  const res = await apiClient.get('/api/features/resolved');
  return safeParse(ResolvedFeaturesResponseSchema, res.data, 'getResolvedFeatures').data;
}
