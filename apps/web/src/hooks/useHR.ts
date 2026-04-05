'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import * as svc from '@/services/hr.service';

// ─── Employees ────────────────────────────────

export function useEmployees(params?: { page?: number; limit?: number; department?: string; isActive?: string }) {
  return useQuery({ queryKey: ['employees', params], queryFn: () => svc.getEmployees(params) });
}

export function useEmployee(id: string) {
  return useQuery({ queryKey: ['employees', id], queryFn: () => svc.getEmployee(id), enabled: !!id });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createEmployee,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Personel oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateEmployee>[1] }) => svc.updateEmployee(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Personel güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteEmployee,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Personel silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: svc.getDepartments });
}

// ─── Leave Requests ───────────────────────────

export function useLeaveRequests(params?: { page?: number; limit?: number; status?: string; employeeId?: string }) {
  return useQuery({ queryKey: ['leave-requests', params], queryFn: () => svc.getLeaveRequests(params) });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createLeaveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); toast.success('İzin talebi oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useApproveLeaveRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => svc.approveLeaveRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); toast.success('İzin onaylandı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.rejectLeaveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); toast.success('İzin reddedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.cancelLeaveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-requests'] }); toast.success('İzin iptal edildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─── Attendance ───────────────────────────────

export function useAttendance(params?: { page?: number; limit?: number; employeeId?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({ queryKey: ['attendance', params], queryFn: () => svc.getAttendance(params) });
}

export function useCheckIn() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.checkIn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Giriş kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.checkOut,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); toast.success('Çıkış kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─── Payroll ──────────────────────────────────

export function usePayrolls(params?: { page?: number; limit?: number; period?: string; employeeId?: string }) {
  return useQuery({ queryKey: ['payrolls', params], queryFn: () => svc.getPayrolls(params) });
}

export function usePayroll(id: string) {
  return useQuery({ queryKey: ['payrolls', id], queryFn: () => svc.getPayroll(id), enabled: !!id });
}

export function useCreatePayroll() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createPayroll,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payrolls'] }); toast.success('Bordro oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useGenerateBulkPayroll() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.generateBulkPayroll,
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['payrolls'] }); toast.success(data.message); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useMarkPayrollPaid() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.markPayrollPaid,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payrolls'] }); toast.success('Bordro ödendi olarak işaretlendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeletePayroll() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deletePayroll,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payrolls'] }); toast.success('Bordro silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
