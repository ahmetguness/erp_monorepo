'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCollaborationEntry, getRecordCollaboration, setRecordFollowing, type RecordContext } from './record-collaboration.api';

const key = (context: RecordContext) => ['record-collaboration', context.entityType, context.entityId] as const;

export function useRecordCollaboration(context: RecordContext) {
  return useQuery({ queryKey: key(context), queryFn: () => getRecordCollaboration(context), enabled: Boolean(context.entityId) });
}

export function useCreateCollaborationEntry(context: RecordContext) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: Parameters<typeof createCollaborationEntry>[1]) => createCollaborationEntry(context, input), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: key(context) }), client.invalidateQueries({ queryKey: ['activity'] })]); } });
}

export function useSetRecordFollowing(context: RecordContext) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (following: boolean) => setRecordFollowing(context, following), onSuccess: () => client.invalidateQueries({ queryKey: key(context) }) });
}
