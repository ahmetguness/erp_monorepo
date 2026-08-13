import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';

export interface EmployeeListInput {
  tenantId: string;
  page: number;
  limit: number;
  skip: number;
  department?: string;
  isActive?: string;
}

export interface CreateEmployeeInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  hireDate: string;
  salary?: number;
}

export interface UpdateEmployeeInput {
  tenantId: string;
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  salary?: number;
  isActive?: boolean;
  leaveDate?: string;
}

export async function listEmployees(input: EmployeeListInput) {
  const where = {
    tenantId: input.tenantId,
    deletedAt: null,
    ...(input.department && { department: input.department }),
    ...(input.isActive !== undefined && { isActive: input.isActive === 'true' }),
  };

  const [total, data] = await prisma.$transaction([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      include: {
        _count: { select: { leaveRequests: true, payrolls: true } },
      },
      orderBy: { lastName: 'asc' },
      skip: input.skip,
      take: input.limit,
    }),
  ]);

  return {
    data,
    meta: {
      total,
      page: input.page,
      pageSize: input.limit,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function getEmployeeById(tenantId: string, id: string) {
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      leaveRequests: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
      payrolls: { where: { deletedAt: null }, orderBy: { period: 'desc' }, take: 12, include: { items: true } },
      attendances: { orderBy: { date: 'desc' }, take: 30 },
    },
  });
  if (!employee) throw new NotFoundError('Personel', id);
  return employee;
}

export async function createEmployee(input: CreateEmployeeInput) {
  if (!input.firstName || !input.lastName || !input.hireDate) {
    throw new ValidationError('firstName, lastName ve hireDate zorunludur.');
  }

  return prisma.employee.create({
    data: {
      tenantId: input.tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      position: input.position ?? null,
      department: input.department ?? null,
      hireDate: new Date(input.hireDate),
      salary: input.salary ?? 0,
    },
  });
}

export async function updateEmployee(input: UpdateEmployeeInput) {
  const existing = await prisma.employee.findFirst({
    where: { id: input.id, tenantId: input.tenantId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('Personel', input.id);

  return prisma.employee.update({
    where: { id: input.id },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.department !== undefined && { department: input.department }),
      ...(input.salary !== undefined && { salary: input.salary }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.leaveDate !== undefined && { leaveDate: input.leaveDate ? new Date(input.leaveDate) : null }),
    },
  });
}

export async function removeEmployee(tenantId: string, id: string) {
  const existing = await prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('Personel', id);

  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  return { success: true };
}

export async function listEmployeeDepartments(tenantId: string) {
  const result = await prisma.employee.groupBy({
    by: ['department'],
    where: { tenantId, deletedAt: null, department: { not: null } },
    _count: { id: true },
  });

  return result.map((row) => ({ name: row.department, count: row._count.id }));
}
