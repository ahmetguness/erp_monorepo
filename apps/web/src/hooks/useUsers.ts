'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getTenantUsers, updateUserRole } from '@/services/user.service';

export function useTenantUsers() {
  return useQuery({ queryKey: ['tenant-users'], queryFn: getTenantUsers });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string | null }) =>
      updateUserRole(userId, roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Kullanıcı rolü güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
