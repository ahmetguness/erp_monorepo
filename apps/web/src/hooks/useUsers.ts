'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  createTenantUser,
  deleteTenantUser,
  getTenantUserById,
  getTenantUsers,
  updateTenantUser,
  updateUserRole,
  type CreateTenantUserDTO,
  type UpdateTenantUserDTO,
} from '@/services/user.service';

export function useTenantUsers() {
  return useQuery({ queryKey: ['tenant-users'], queryFn: getTenantUsers });
}

export function useTenantUser(userId: string) {
  return useQuery({ queryKey: ['tenant-users', userId], queryFn: () => getTenantUserById(userId), enabled: !!userId });
}

export function useCreateTenantUser() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateTenantUserDTO) => createTenantUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users'] });
      toast.success('Kullanıcı oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateTenantUser(userId: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateTenantUserDTO) => updateTenantUser(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users'] });
      qc.invalidateQueries({ queryKey: ['tenant-users', userId] });
      toast.success('Kullanıcı güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
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

export function useDeleteTenantUser() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (userId: string) => deleteTenantUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users'] });
      toast.success('Kullanıcı pasifleştirildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
