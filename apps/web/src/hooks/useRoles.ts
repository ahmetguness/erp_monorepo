'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getRoles, getRoleById, createRole, updateRole, deleteRole, addPermission, removePermission,
  type ListParams, type CreateRoleDTO, type UpdateRoleDTO, type AddPermissionDTO,
} from '@/services/role.service';

const KEYS = {
  list: (p: ListParams) => ['roles', p] as const,
  detail: (id: string) => ['roles', id] as const,
};

export function useRoles(params: ListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => getRoles(params),
    enabled: options?.enabled ?? true,
  });
}
export function useRole(id: string) {
  return useQuery({ queryKey: KEYS.detail(id), queryFn: () => getRoleById(id), enabled: !!id });
}
export function useCreateRole() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateRoleDTO) => createRole(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Rol oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useUpdateRole() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleDTO }) => updateRole(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Rol güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useDeleteRole() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Rol silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useAddPermission() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: AddPermissionDTO }) => addPermission(roleId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('İzin eklendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useRemovePermission() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ roleId, permissionId }: { roleId: string; permissionId: string }) => removePermission(roleId, permissionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('İzin kaldırıldı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
