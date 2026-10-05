import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { validateBody } from "../middleware/validateBody.js";
import {
  createEmployeeBodySchema,
  updateEmployeeBodySchema,
  createLeaveRequestBodySchema,
  leaveTransitionBodySchema,
  attendanceCheckInBodySchema,
  attendanceCheckOutBodySchema,
  updateAttendanceBodySchema,
} from "../schemas/request-body.schemas.js";
import {
  AdvancedHrController,
  AttendanceController,
  EmployeeController,
  LeaveRequestController,
} from "../modules/workforce-service/http/controllers/index.js";

const hrRoutes = new Hono();

hrRoutes.use("*", requireAccess(ACCESS_POLICIES.hr));
hrRoutes.get(
  "/advanced",
  requirePermission("hr", "READ"),
  AdvancedHrController.get,
);

// Personel
hrRoutes.get(
  "/employees",
  requirePermission("hr", "READ"),
  EmployeeController.list,
);
hrRoutes.get(
  "/employees/departments",
  requirePermission("hr", "READ"),
  EmployeeController.departments,
);
hrRoutes.get(
  "/employees/:id",
  requirePermission("hr", "READ"),
  EmployeeController.getById,
);
hrRoutes.post(
  "/employees",
  requirePermission("hr", "CREATE"),
  validateBody(createEmployeeBodySchema),
  EmployeeController.create,
);
hrRoutes.patch(
  "/employees/:id",
  requirePermission("hr", "UPDATE"),
  validateBody(updateEmployeeBodySchema),
  EmployeeController.update,
);
hrRoutes.delete(
  "/employees/:id",
  requirePermission("hr", "DELETE"),
  EmployeeController.remove,
);

// İzin Talepleri
hrRoutes.get(
  "/leave-requests",
  requirePermission("hr", "READ"),
  LeaveRequestController.list,
);
hrRoutes.get(
  "/leave-requests/:id",
  requirePermission("hr", "READ"),
  LeaveRequestController.getById,
);
hrRoutes.post(
  "/leave-requests",
  requirePermission("hr", "CREATE"),
  validateBody(createLeaveRequestBodySchema),
  LeaveRequestController.create,
);
hrRoutes.post(
  "/leave-requests/:id/approve",
  requirePermission("hr", "UPDATE"),
  validateBody(leaveTransitionBodySchema),
  LeaveRequestController.approve,
);
hrRoutes.post(
  "/leave-requests/:id/reject",
  requirePermission("hr", "UPDATE"),
  validateBody(leaveTransitionBodySchema),
  LeaveRequestController.reject,
);
hrRoutes.post(
  "/leave-requests/:id/cancel",
  requirePermission("hr", "UPDATE"),
  validateBody(leaveTransitionBodySchema),
  LeaveRequestController.cancel,
);

// Puantaj
hrRoutes.get(
  "/attendance",
  requirePermission("hr", "READ"),
  AttendanceController.list,
);
hrRoutes.post(
  "/attendance/check-in",
  requirePermission("hr", "CREATE"),
  validateBody(attendanceCheckInBodySchema),
  AttendanceController.checkIn,
);
hrRoutes.post(
  "/attendance/check-out",
  requirePermission("hr", "UPDATE"),
  validateBody(attendanceCheckOutBodySchema),
  AttendanceController.checkOut,
);
hrRoutes.patch(
  "/attendance/:id",
  requirePermission("hr", "UPDATE"),
  validateBody(updateAttendanceBodySchema),
  AttendanceController.update,
);
hrRoutes.delete(
  "/attendance/:id",
  requirePermission("hr", "DELETE"),
  AttendanceController.remove,
);

export { hrRoutes };
