import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { EmployeeController } from '../controllers/employee.controller';
import { LeaveRequestController } from '../controllers/leave-request.controller';
import { AttendanceController } from '../controllers/attendance.controller';

const hrRoutes = new Hono();

hrRoutes.use('*', requireAccess(ACCESS_POLICIES.hr));

// Personel
hrRoutes.get('/employees', requirePermission('hr', 'READ'), EmployeeController.list);
hrRoutes.get('/employees/departments', requirePermission('hr', 'READ'), EmployeeController.departments);
hrRoutes.get('/employees/:id', requirePermission('hr', 'READ'), EmployeeController.getById);
hrRoutes.post('/employees', requirePermission('hr', 'CREATE'), EmployeeController.create);
hrRoutes.patch('/employees/:id', requirePermission('hr', 'UPDATE'), EmployeeController.update);
hrRoutes.delete('/employees/:id', requirePermission('hr', 'DELETE'), EmployeeController.remove);

// İzin Talepleri
hrRoutes.get('/leave-requests', requirePermission('hr', 'READ'), LeaveRequestController.list);
hrRoutes.get('/leave-requests/:id', requirePermission('hr', 'READ'), LeaveRequestController.getById);
hrRoutes.post('/leave-requests', requirePermission('hr', 'CREATE'), LeaveRequestController.create);
hrRoutes.post('/leave-requests/:id/approve', requirePermission('hr', 'UPDATE'), LeaveRequestController.approve);
hrRoutes.post('/leave-requests/:id/reject', requirePermission('hr', 'UPDATE'), LeaveRequestController.reject);
hrRoutes.post('/leave-requests/:id/cancel', requirePermission('hr', 'UPDATE'), LeaveRequestController.cancel);

// Puantaj
hrRoutes.get('/attendance', requirePermission('hr', 'READ'), AttendanceController.list);
hrRoutes.post('/attendance/check-in', requirePermission('hr', 'CREATE'), AttendanceController.checkIn);
hrRoutes.post('/attendance/check-out', requirePermission('hr', 'UPDATE'), AttendanceController.checkOut);
hrRoutes.patch('/attendance/:id', requirePermission('hr', 'UPDATE'), AttendanceController.update);
hrRoutes.delete('/attendance/:id', requirePermission('hr', 'DELETE'), AttendanceController.remove);

export { hrRoutes };
