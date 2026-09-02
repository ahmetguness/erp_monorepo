'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { distributeNavigationProfile, getNavigationWorkspace, recordNavigationActivity, updateNavigationPreferences } from './navigation-workspace.service';

const KEY = ['navigation-workspace'] as const;

export function useNavigationWorkspace() {
  return useQuery({ queryKey: KEY, queryFn: getNavigationWorkspace, staleTime: 60_000 });
}

export function useUpdateNavigationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: updateNavigationPreferences, onSuccess: (data) => queryClient.setQueryData(KEY, data) });
}

export function useRecordNavigationActivity() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: recordNavigationActivity, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useDistributeNavigationProfile() {
  return useMutation({ mutationFn: ({ roleId, input }: { roleId: string; input: Parameters<typeof distributeNavigationProfile>[1] }) => distributeNavigationProfile(roleId, input) });
}
