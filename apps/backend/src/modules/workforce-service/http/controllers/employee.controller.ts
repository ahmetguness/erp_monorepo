import { Context } from "hono";
import {
  createEmployee,
  getEmployeeById,
  listEmployeeDepartments,
  listEmployees,
  removeEmployee,
  updateEmployee,
} from "../../../../services/employee.service.js";
import { requireParam, requireTenantId } from "../../../../utils/context.js";
import { getPaginationParams } from "../../../../utils/pagination.js";
import { getValidatedBody } from "../../../../middleware/validateBody.js";
import {
  createEmployeeBodySchema,
  updateEmployeeBodySchema,
  type CreateEmployeeBody,
  type UpdateEmployeeBody,
} from "../../../../schemas/request-body.schemas.js";
import { ValidationError } from "../../../../errors/index.js";

function validateListQuery(c: Context): void {
  const page = c.req.query("page");
  const limit = c.req.query("limit");
  const isActive = c.req.query("isActive");
  if (page !== undefined && (!/^\d+$/.test(page) || Number(page) < 1)) {
    throw new ValidationError("page pozitif bir tam sayi olmalidir.");
  }
  if (
    limit !== undefined &&
    (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)
  ) {
    throw new ValidationError("limit 1 ile 100 arasinda olmalidir.");
  }
  if (isActive !== undefined && !["true", "false"].includes(isActive)) {
    throw new ValidationError("isActive true veya false olmalidir.");
  }
}

// ─────────────────────────────────────────────
// Employee Controller — Personel CRUD
// ─────────────────────────────────────────────

export const EmployeeController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    validateListQuery(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const department = c.req.query("department");
    const isActive = c.req.query("isActive");
    const search = c.req.query("search");

    const result = await listEmployees({
      tenantId,
      page,
      limit,
      skip,
      department,
      isActive,
      search,
    });

    return c.json(result);
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const employee = await getEmployeeById(tenantId, id);

    return c.json({ data: employee });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody<CreateEmployeeBody>(
      c,
      createEmployeeBodySchema,
    );
    const employee = await createEmployee({ tenantId, ...body });

    return c.json({ data: employee }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const body = getValidatedBody<UpdateEmployeeBody>(
      c,
      updateEmployeeBodySchema,
    );
    const updated = await updateEmployee({ tenantId, id, ...body });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const result = await removeEmployee(tenantId, id);

    return c.json({ data: result });
  },

  async departments(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const departments = await listEmployeeDepartments(tenantId);

    return c.json({ data: departments });
  },
};
