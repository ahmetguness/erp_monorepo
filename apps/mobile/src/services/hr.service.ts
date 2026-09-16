import { z } from 'zod';
import { apiClient } from '../lib/api-client';

// ─────────────────────────────────────────────
// FAZ 8: HR & Employee Self-Service Schemas
// ─────────────────────────────────────────────

export const LeaveTypeSchema = z.enum([
  'ANNUAL',
  'SICK',
  'MATERNITY',
  'PATERNITY',
  'UNPAID',
  'OTHER',
]);
export type LeaveType = z.infer<typeof LeaveTypeSchema>;

export const LeaveStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type LeaveStatus = z.infer<typeof LeaveStatusSchema>;

export const EmployeeSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  hireDate: z.string(),
  leaveDate: z.string().nullable().optional(),
  salary: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

export const LeaveRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  type: LeaveTypeSchema,
  status: LeaveStatusSchema.default('PENDING'),
  startDate: z.string(),
  endDate: z.string(),
  days: z.coerce.number(),
  notes: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      department: z.string().nullable().optional(),
      position: z.string().nullable().optional(),
    })
    .optional(),
});
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;

export const AttendanceRecordSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  date: z.string(),
  checkIn: z.string().nullable().optional(),
  checkOut: z.string().nullable().optional(),
  overtimeHours: z.coerce.number().default(0),
  notes: z.string().nullable().optional(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      department: z.string().nullable().optional(),
    })
    .optional(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

export const PayrollItemSchema = z.object({
  id: z.string(),
  payrollId: z.string().optional(),
  label: z.string(),
  amount: z.coerce.number(),
  isDeduction: z.boolean().default(false),
});
export type PayrollItem = z.infer<typeof PayrollItemSchema>;

export const PayrollRecordSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  period: z.string(), // "2026-03"
  grossSalary: z.coerce.number(),
  deductions: z.coerce.number().default(0),
  netSalary: z.coerce.number(),
  paidAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      department: z.string().nullable().optional(),
      position: z.string().nullable().optional(),
      salary: z.coerce.number().optional(),
    })
    .optional(),
  items: z.array(PayrollItemSchema).default([]),
});
export type PayrollRecord = z.infer<typeof PayrollRecordSchema>;

// ─────────────────────────────────────────────
// Computed Summary Models
// ─────────────────────────────────────────────

export interface LeaveBalanceSummary {
  totalAnnual: number;
  usedAnnual: number;
  remainingAnnual: number;
  totalExcused: number;
  usedExcused: number;
  remainingExcused: number;
  pendingCount: number;
}

export interface ShiftDayInfo {
  date: string; // YYYY-MM-DD
  dayName: string;
  isToday: boolean;
  isWeekend: boolean;
  shiftHours: string;
  attendance: AttendanceRecord | null;
  onLeave: LeaveRequest | null;
}

export interface CreateLeaveRequestInput {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  notes?: string;
}

// ─────────────────────────────────────────────
// Helper Dictionaries
// ─────────────────────────────────────────────

export const LEAVE_TYPE_META: Record<
  LeaveType,
  { label: string; icon: string; color: string; bg: string }
> = {
  ANNUAL: {
    label: 'Yıllık İzin',
    icon: 'sunny-outline',
    color: '#0284c7',
    bg: '#e0f2fe',
  },
  SICK: {
    label: 'Hastalık / Rapor',
    icon: 'medkit-outline',
    color: '#ea580c',
    bg: '#ffedd5',
  },
  MATERNITY: {
    label: 'Doğum İzni',
    icon: 'heart-outline',
    color: '#db2777',
    bg: '#fce7f3',
  },
  PATERNITY: {
    label: 'Babalık İzni',
    icon: 'people-outline',
    color: '#4f46e5',
    bg: '#e0e7ff',
  },
  UNPAID: {
    label: 'Ücretsiz İzin',
    icon: 'calendar-clear-outline',
    color: '#64748b',
    bg: '#f1f5f9',
  },
  OTHER: {
    label: 'Mazeret / Diğer',
    icon: 'help-circle-outline',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
};

// ─────────────────────────────────────────────
// API Methods
// ─────────────────────────────────────────────

/**
 * List employees with optional search or department filter
 */
export async function getEmployees(params?: {
  search?: string;
  department?: string;
  limit?: number;
}): Promise<{ employees: Employee[]; total: number }> {
  const res = await apiClient.get('/hr/employees', { params });
  const rawList = res.data?.data ?? [];
  const total = res.data?.meta?.total ?? rawList.length;
  const parsed = z.array(EmployeeSchema).safeParse(rawList);
  return {
    employees: parsed.success ? parsed.data : (rawList as Employee[]),
    total,
  };
}

/**
 * Fetch employee by ID
 */
export async function getEmployeeById(id: string): Promise<Employee> {
  const res = await apiClient.get(`/hr/employees/${id}`);
  const raw = res.data?.data ?? res.data;
  const parsed = EmployeeSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as Employee);
}

/**
 * Resolve current user's employee profile
 */
export async function getCurrentEmployee(userEmail?: string): Promise<Employee | null> {
  try {
    if (userEmail) {
      const res = await getEmployees({ search: userEmail, limit: 5 });
      const found = res.employees.find(
        (e) => e.email?.toLowerCase() === userEmail.toLowerCase(),
      );
      if (found) return found;
    }
    // Fallback: fetch first active employee
    const fallback = await getEmployees({ limit: 1 });
    return fallback.employees.length > 0 ? fallback.employees[0] : null;
  } catch (err) {
    console.warn('[hr.service] getCurrentEmployee error:', err);
    return null;
  }
}

/**
 * 8.1: Fetch Leave Requests
 */
export async function getLeaveRequests(params?: {
  employeeId?: string;
  status?: LeaveStatus;
  limit?: number;
}): Promise<{ requests: LeaveRequest[]; total: number }> {
  const res = await apiClient.get('/hr/leave-requests', { params });
  const rawList = res.data?.data ?? [];
  const total = res.data?.meta?.total ?? rawList.length;
  const parsed = z.array(LeaveRequestSchema).safeParse(rawList);
  return {
    requests: parsed.success ? parsed.data : (rawList as LeaveRequest[]),
    total,
  };
}

/**
 * 8.1: Compute Leave Balances (Total, Used, Remaining)
 */
export async function getLeaveBalance(
  employee: Employee,
): Promise<LeaveBalanceSummary> {
  try {
    const res = await getLeaveRequests({ employeeId: employee.id, limit: 100 });
    const requests = res.requests;

    // Calculate entitlement based on seniority (hire date)
    const hireDate = new Date(employee.hireDate);
    const now = new Date();
    const yearsOfService = Math.max(
      0,
      (now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
    );

    // Standard Turkish labor law entitlement:
    // 1-5 years: 14 days, 5-15 years: 20 days, 15+ years: 26 days
    let totalAnnual = 14;
    if (yearsOfService >= 15) {
      totalAnnual = 26;
    } else if (yearsOfService >= 5) {
      totalAnnual = 20;
    }

    const totalExcused = 5; // Standard annual excused/casual allowance

    let usedAnnual = 0;
    let usedExcused = 0;
    let pendingCount = 0;

    for (const req of requests) {
      if (req.status === 'APPROVED') {
        if (req.type === 'ANNUAL') {
          usedAnnual += req.days;
        } else if (req.type === 'OTHER' || req.type === 'SICK') {
          usedExcused += req.days;
        }
      } else if (req.status === 'PENDING') {
        pendingCount++;
      }
    }

    return {
      totalAnnual,
      usedAnnual,
      remainingAnnual: Math.max(0, totalAnnual - usedAnnual),
      totalExcused,
      usedExcused,
      remainingExcused: Math.max(0, totalExcused - usedExcused),
      pendingCount,
    };
  } catch (err) {
    console.warn('[hr.service] getLeaveBalance error:', err);
    return {
      totalAnnual: 14,
      usedAnnual: 0,
      remainingAnnual: 14,
      totalExcused: 5,
      usedExcused: 0,
      remainingExcused: 5,
      pendingCount: 0,
    };
  }
}

/**
 * 8.1: Create New Leave Request
 */
export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
): Promise<LeaveRequest> {
  const res = await apiClient.post('/hr/leave-requests', input);
  const raw = res.data?.data ?? res.data;
  const parsed = LeaveRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as LeaveRequest);
}

/**
 * 8.1: Cancel Pending Leave Request
 */
export async function cancelLeaveRequest(id: string): Promise<void> {
  await apiClient.post(`/hr/leave-requests/${id}/cancel`);
}

/**
 * 8.2: Fetch Attendance Records (Puantaj / Çalışma Çizelgesi)
 */
export async function getAttendances(params?: {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AttendanceRecord[]> {
  const res = await apiClient.get('/hr/attendance', { params });
  const rawList = res.data?.data ?? [];
  const parsed = z.array(AttendanceRecordSchema).safeParse(rawList);
  return parsed.success ? parsed.data : (rawList as AttendanceRecord[]);
}

/**
 * 8.2: Digital Clock-In (Giriş Yap)
 */
export async function clockIn(
  employeeId: string,
  notes?: string,
): Promise<AttendanceRecord> {
  const res = await apiClient.post('/hr/attendance/check-in', {
    employeeId,
    checkIn: new Date().toISOString(),
    notes,
  });
  const raw = res.data?.data ?? res.data;
  const parsed = AttendanceRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as AttendanceRecord);
}

/**
 * 8.2: Digital Clock-Out (Çıkış Yap)
 */
export async function clockOut(
  employeeId: string,
  overtimeHours = 0,
): Promise<AttendanceRecord> {
  const res = await apiClient.post('/hr/attendance/check-out', {
    employeeId,
    checkOut: new Date().toISOString(),
    overtimeHours,
  });
  const raw = res.data?.data ?? res.data;
  const parsed = AttendanceRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as AttendanceRecord);
}

/**
 * 8.3: Fetch Payroll Records
 */
export async function getPayrolls(params?: {
  employeeId?: string;
  period?: string;
  limit?: number;
}): Promise<{ payrolls: PayrollRecord[]; total: number }> {
  const res = await apiClient.get('/payroll', { params });
  const rawList = res.data?.data ?? [];
  const total = res.data?.meta?.total ?? rawList.length;
  const parsed = z.array(PayrollRecordSchema).safeParse(rawList);
  return {
    payrolls: parsed.success ? parsed.data : (rawList as PayrollRecord[]),
    total,
  };
}

/**
 * 8.3: Fetch Detailed Payroll Slip with Items
 */
export async function getPayrollById(id: string): Promise<PayrollRecord> {
  const res = await apiClient.get(`/payroll/${id}`);
  const raw = res.data?.data ?? res.data;
  const parsed = PayrollRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as PayrollRecord);
}
