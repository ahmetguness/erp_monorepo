import { Context } from 'hono';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId, requireParam } from '../utils/context.js';
import {
  createEmployee,
  getEmployeeById,
  listEmployeeDepartments,
  listEmployees,
  removeEmployee,
  updateEmployee,
} from '../services/employee.service.js';

// ─────────────────────────────────────────────
// Employee Controller — Personel CRUD
// ─────────────────────────────────────────────

export const EmployeeController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const department = c.req.query('department');
    const isActive = c.req.query('isActive');

    const result = await listEmployees({ tenantId, page, limit, skip, department, isActive });

    return c.json(result);
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const employee = await getEmployeeById(tenantId, id);

    return c.json({ data: employee });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      firstName: string; lastName: string; email?: string; phone?: string;
      position?: string; department?: string; hireDate: string; salary?: number;
    }>();
    const employee = await createEmployee({ tenantId, ...body });

    return c.json({ data: employee }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const body = await c.req.json<{
      firstName?: string; lastName?: string; email?: string; phone?: string;
      position?: string; department?: string; salary?: number;
      isActive?: boolean; leaveDate?: string;
    }>();
    const updated = await updateEmployee({ tenantId, id, ...body });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const result = await removeEmployee(tenantId, id);

    return c.json({ data: result });
  },

  async departments(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const departments = await listEmployeeDepartments(tenantId);

    return c.json({ data: departments });
  },
};
