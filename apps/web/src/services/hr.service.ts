import { apiClient } from '@/lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Employee {
  id: string; tenantId: string; firstName: string; lastName: string;
  email: string | null; phone: string | null; position: string | null;
  department: string | null; hireDate: string; leaveDate: string | null;
  salary: number; isActive: boolean; createdAt: string; updatedAt: string;
  leaveRequests?: LeaveRequest[]; payrolls?: Payroll[]; attendances?: Attendance[];
  _count?: { leaveRequests: number; payrolls: number };
}

export interface LeaveRequest {
  id: string; tenantId: string; employeeId: string; type: string; status: string;
  startDate: string; endDate: string; days: number; notes: string | null;
  approvedBy: string | null; approvedAt: string | null; createdAt: string;
  employee?: { id: string; firstName: string; lastName: string; department: string | null; position: string | null };
}

export interface Attendance {
  id: string; tenantId: string; employeeId: string; date: string;
  checkIn: string | null; checkOut: string | null; overtimeHours: number; notes: string | null;
  employee?: { id: string; firstName: string; lastName: string; department: string | null };
}

export interface PayrollItem {
  id: string; label: string; amount: number; isDeduction: boolean;
}

export interface Payroll {
  id: string; tenantId: string; employeeId: string; period: string;
  grossSalary: number; deductions: number; netSalary: number;
  paidAt: string | null; notes: string | null; createdAt: string;
  employee?: { id: string; firstName: string; lastName: string; department: string | null; position: string | null; salary?: number };
  items?: PayrollItem[];
}

export interface Department { name: string | null; count: number; }

export type HrReviewStatus = 'ready' | 'scheduled' | 'missing';
export type HrTrainingStatus = 'complete' | 'planned' | 'missing';
export type HrAssetStatus = 'assigned' | 'missing';

export interface AdvancedHrEmployeeRef {
  id: string;
  fullName: string;
  department: string | null;
  position: string | null;
}

export interface PerformanceReviewRow {
  employee: AdvancedHrEmployeeRef;
  status: HrReviewStatus;
  openActionCount: number;
  lastReviewAt: string | null;
  nextReviewAt: string;
}

export interface TrainingMatrixRow {
  employee: AdvancedHrEmployeeRef;
  status: HrTrainingStatus;
  completedCount: number;
  plannedCount: number;
  missingTopics: string[];
}

export interface HrAssetAssignmentRow {
  employee: AdvancedHrEmployeeRef;
  status: HrAssetStatus;
  assetCount: number;
  documentCount: number;
  lastAssignedAt: string | null;
}

export interface OrganizationNode {
  id: string;
  parentId: string | null;
  label: string;
  type: 'department' | 'position' | 'employee';
  employeeCount: number;
}

export interface AdvancedHrResult {
  summary: {
    employeeCount: number;
    departmentCount: number;
    reviewMissingCount: number;
    trainingMissingCount: number;
    assetMissingCount: number;
    organizationNodeCount: number;
  };
  performanceReviews: PerformanceReviewRow[];
  trainingMatrix: TrainingMatrixRow[];
  assetAssignments: HrAssetAssignmentRow[];
  organization: OrganizationNode[];
}

type Paginated<T> = { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };

// ─── Employees ────────────────────────────────

export const getEmployees = (params?: { page?: number; limit?: number; department?: string; isActive?: string }) =>
  apiClient.get<Paginated<Employee>>('/api/hr/employees', { params }).then((r) => r.data);

export const getEmployee = (id: string) =>
  apiClient.get<{ data: Employee }>(`/api/hr/employees/${id}`).then((r) => r.data.data);

export const createEmployee = (data: {
  firstName: string; lastName: string; email?: string; phone?: string;
  position?: string; department?: string; hireDate: string; salary?: number;
}) => apiClient.post<{ data: Employee }>('/api/hr/employees', data).then((r) => r.data.data);

export const updateEmployee = (id: string, data: Partial<{
  firstName: string; lastName: string; email: string; phone: string;
  position: string; department: string; salary: number; isActive: boolean; leaveDate: string;
}>) => apiClient.patch<{ data: Employee }>(`/api/hr/employees/${id}`, data).then((r) => r.data.data);

export const deleteEmployee = (id: string) => apiClient.delete(`/api/hr/employees/${id}`);

export const getDepartments = () =>
  apiClient.get<{ data: Department[] }>('/api/hr/employees/departments').then((r) => r.data.data);

export const getAdvancedHr = () =>
  apiClient.get<{ data: AdvancedHrResult }>('/api/hr/advanced').then((r) => r.data.data);

// ─── Leave Requests ───────────────────────────

export const getLeaveRequests = (params?: { page?: number; limit?: number; status?: string; employeeId?: string }) =>
  apiClient.get<Paginated<LeaveRequest>>('/api/hr/leave-requests', { params }).then((r) => r.data);

export const getLeaveRequest = (id: string) =>
  apiClient.get<{ data: LeaveRequest }>(`/api/hr/leave-requests/${id}`).then((r) => r.data.data);

export const createLeaveRequest = (data: {
  employeeId: string; type: string; startDate: string; endDate: string; days: number; notes?: string;
}) => apiClient.post<{ data: LeaveRequest }>('/api/hr/leave-requests', data).then((r) => r.data.data);

export const approveLeaveRequest = (id: string, data?: { approvedBy?: string }) =>
  apiClient.post<{ data: LeaveRequest }>(`/api/hr/leave-requests/${id}/approve`, data ?? {}).then((r) => r.data.data);

export const rejectLeaveRequest = (id: string) =>
  apiClient.post<{ data: LeaveRequest }>(`/api/hr/leave-requests/${id}/reject`, {}).then((r) => r.data.data);

export const cancelLeaveRequest = (id: string) =>
  apiClient.post<{ data: LeaveRequest }>(`/api/hr/leave-requests/${id}/cancel`, {}).then((r) => r.data.data);

// ─── Attendance ───────────────────────────────

export const getAttendance = (params?: { page?: number; limit?: number; employeeId?: string; dateFrom?: string; dateTo?: string }) =>
  apiClient.get<Paginated<Attendance>>('/api/hr/attendance', { params }).then((r) => r.data);

export const checkIn = (data: { employeeId: string; date?: string; checkIn?: string; notes?: string }) =>
  apiClient.post<{ data: Attendance }>('/api/hr/attendance/check-in', data).then((r) => r.data.data);

export const checkOut = (data: { employeeId: string; date?: string; checkOut?: string; overtimeHours?: number }) =>
  apiClient.post<{ data: Attendance }>('/api/hr/attendance/check-out', data).then((r) => r.data.data);

export const updateAttendance = (id: string, data: { checkIn?: string | null; checkOut?: string | null; overtimeHours?: number; notes?: string }) =>
  apiClient.patch<{ data: Attendance }>(`/api/hr/attendance/${id}`, data).then((r) => r.data.data);

export const deleteAttendance = (id: string) => apiClient.delete(`/api/hr/attendance/${id}`);

// ─── Payroll ──────────────────────────────────

export const getPayrolls = (params?: { page?: number; limit?: number; period?: string; employeeId?: string }) =>
  apiClient.get<Paginated<Payroll>>('/api/payroll', { params }).then((r) => r.data);

export const getPayroll = (id: string) =>
  apiClient.get<{ data: Payroll }>(`/api/payroll/${id}`).then((r) => r.data.data);

export const createPayroll = (data: {
  employeeId: string; period: string; grossSalary: number;
  items?: Array<{ label: string; amount: number; isDeduction: boolean }>; notes?: string;
}) => apiClient.post<{ data: Payroll }>('/api/payroll', data).then((r) => r.data.data);

export const generateBulkPayroll = (data: { period: string }) =>
  apiClient.post<{ data: { created: number; message: string } }>('/api/payroll/generate-bulk', data).then((r) => r.data.data);

export const addPayrollItem = (payrollId: string, data: { label: string; amount: number; isDeduction: boolean }) =>
  apiClient.post<{ data: PayrollItem }>(`/api/payroll/${payrollId}/items`, data).then((r) => r.data.data);

export const removePayrollItem = (payrollId: string, itemId: string) =>
  apiClient.delete(`/api/payroll/${payrollId}/items/${itemId}`);

export const markPayrollPaid = (id: string) =>
  apiClient.post<{ data: Payroll }>(`/api/payroll/${id}/pay`, {}).then((r) => r.data.data);

export const deletePayroll = (id: string) => apiClient.delete(`/api/payroll/${id}`);

// ─── Payroll Integrations ─────────────────────

export interface ClosingCheckItem {
  name: string;
  passed: boolean;
  message: string;
}

export interface PeriodClosingChecksResult {
  success: boolean;
  checks: ClosingCheckItem[];
}

export const getPayrollBankFile = (period: string) =>
  apiClient.get('/api/payroll/integration/bank-file', { params: { period }, responseType: 'blob' }).then((r) => r.data);

export const createPayrollAccountingVoucher = (period: string) =>
  apiClient.post<{ data: { id: string; number: string; totalGross: number; totalNet: number; totalDeductions: number } }>('/api/payroll/integration/accounting-voucher', { period }).then((r) => r.data.data);

export const getPayrollClosingChecks = (period: string) =>
  apiClient.get<{ data: PeriodClosingChecksResult }>('/api/payroll/integration/closing-checks', { params: { period } }).then((r) => r.data.data);
