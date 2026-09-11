import { prisma } from '../../lib/prisma';
import { getCurrentPeriod, getMonthStartDate, groupByDepartment } from './shared.js';

export const workforceChatDataService = {
  async getPendingLeaves(tenantId: string) {
    const leaves = await prisma.leaveRequest.findMany({
      where: { tenantId, deletedAt: null, status: 'PENDING' },
      select: {
        type: true, startDate: true, endDate: true, days: true, status: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { data: leaves, count: leaves.length };
  },

  /** Açık iş emirleri */
  async getEmployees(tenantId: string) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        firstName: true, lastName: true, email: true, phone: true,
        position: true, department: true, hireDate: true,
      },
      orderBy: { firstName: 'asc' },
      take: 50,
    });
    return { data: employees, count: employees.length };
  },

  /** Personel özeti (departman dağılımı vb.) */
  async getEmployeeSummary(tenantId: string) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { department: true, position: true, hireDate: true },
    });

    const departmentCounts: Record<string, number> = {};
    for (const emp of employees) {
      const dept = emp.department ?? 'Belirtilmemiş';
      departmentCounts[dept] = (departmentCounts[dept] ?? 0) + 1;
    }

    const departments = Object.entries(departmentCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      data: {
        totalEmployees: employees.length,
        departments,
      },
    };
  },

  /** Belirli personelin bordro geçmişi */
  async getEmployeePayroll(tenantId: string, employeeName: string) {
    // İsmi kelimelere ayır, gereksiz kelimeleri temizle
    const stopWords = ['hanım', 'bey', 'hanımın', 'beyin', "hanım'ın", "bey'in", 'nın', 'nin', 'ın', 'in', 'un', 'ün'];
    const words = employeeName
      .split(/\s+/)
      .map((w) => w.replace(/[''`]/g, '').toLowerCase())
      .filter((w) => w.length > 1 && !stopWords.includes(w));

    if (words.length === 0) {
      return { data: null, message: 'Geçerli bir personel adı belirtilmedi.' };
    }

    // Her kelimeyi firstName veya lastName'de ara (AND mantığı)
    const employees = await prisma.employee.findMany({
      where: {
        tenantId, deletedAt: null, isActive: true,
        AND: words.map((word) => ({
          OR: [
            { firstName: { contains: word, mode: 'insensitive' as const } },
            { lastName: { contains: word, mode: 'insensitive' as const } },
          ],
        })),
      },
      select: { id: true, firstName: true, lastName: true },
    });

    if (employees.length === 0) {
      return { data: null, message: `"${employeeName}" ile eşleşen personel bulunamadı.` };
    }

    // İlk eşleşen personelin bordro kayıtlarını getir
    const employee = employees[0];
    const payrolls = await prisma.payroll.findMany({
      where: { tenantId, employeeId: employee.id, deletedAt: null },
      select: {
        period: true, grossSalary: true, deductions: true, netSalary: true, paidAt: true,
        items: { select: { label: true, amount: true, isDeduction: true } },
      },
      orderBy: { period: 'desc' },
      take: 12,
    });

    return {
      data: {
        employee: { name: `${employee.firstName} ${employee.lastName}` },
        payrolls: payrolls.map((p) => ({
          period: p.period,
          grossSalary: Number(p.grossSalary),
          deductions: Number(p.deductions),
          netSalary: Number(p.netSalary),
          paid: !!p.paidAt,
          items: p.items.map((i) => ({
            label: i.label, amount: Number(i.amount), isDeduction: i.isDeduction,
          })),
        })),
        totalRecords: payrolls.length,
        ...(payrolls.length === 0 && { message: `${employee.firstName} ${employee.lastName} için henüz bordro kaydı bulunmuyor.` }),
      },
    };
  },

  /** Dönem bazlı bordro özeti */
  async getPayrollSummary(tenantId: string, period?: string) {
    // period="all" → tüm dönemler, period=undefined → bu ay, period="2026-03" → belirli dönem
    const isAll = period === 'all';
    const targetPeriod = isAll ? undefined : (period ?? getCurrentPeriod());

    const payrolls = await prisma.payroll.findMany({
      where: {
        tenantId, deletedAt: null,
        ...(targetPeriod && { period: targetPeriod }),
      },
      select: {
        period: true, grossSalary: true, deductions: true, netSalary: true, paidAt: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
    });

    const totalGross = payrolls.reduce((s, p) => s + Number(p.grossSalary), 0);
    const totalDeductions = payrolls.reduce((s, p) => s + Number(p.deductions), 0);
    const totalNet = payrolls.reduce((s, p) => s + Number(p.netSalary), 0);
    const paidCount = payrolls.filter((p) => p.paidAt).length;

    // Dönem bazlı kırılım
    const byPeriod: Record<string, { gross: number; net: number; count: number }> = {};
    for (const p of payrolls) {
      if (!byPeriod[p.period]) byPeriod[p.period] = { gross: 0, net: 0, count: 0 };
      byPeriod[p.period].gross += Number(p.grossSalary);
      byPeriod[p.period].net += Number(p.netSalary);
      byPeriod[p.period].count++;
    }

    return {
      data: {
        period: isAll ? 'Tüm dönemler' : targetPeriod,
        employeeCount: payrolls.length,
        totalGross, totalDeductions, totalNet,
        paidCount, unpaidCount: payrolls.length - paidCount,
        byDepartment: groupByDepartment(payrolls),
        ...(isAll && { byPeriod: Object.entries(byPeriod).map(([p, d]) => ({ period: p, ...d })).sort((a, b) => b.period.localeCompare(a.period)) }),
      },
    };
  },

  /** Puantaj özeti */
  async getAttendanceSummary(tenantId: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : getMonthStartDate();
    const to = dateTo ? new Date(dateTo) : new Date();

    const attendances = await prisma.attendance.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      select: {
        date: true, checkIn: true, checkOut: true, overtimeHours: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
      orderBy: { date: 'desc' },
      take: 100,
    });

    const totalOvertime = attendances.reduce((s, a) => s + Number(a.overtimeHours), 0);
    const uniqueEmployees = new Set(attendances.map((a) => `${a.employee.firstName} ${a.employee.lastName}`)).size;

    return {
      data: {
        period: { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] },
        totalRecords: attendances.length,
        uniqueEmployees,
        totalOvertimeHours: totalOvertime,
        records: attendances.slice(0, 30).map((a) => ({
          employee: `${a.employee.firstName} ${a.employee.lastName}`,
          department: a.employee.department,
          date: a.date,
          checkIn: a.checkIn, checkOut: a.checkOut,
          overtimeHours: Number(a.overtimeHours),
        })),
      },
    };
  },

  // ── STARTER — Ek tool'lar ──────────────────

  /** Ürün listesi */
} as const;
