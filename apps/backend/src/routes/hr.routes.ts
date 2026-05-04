import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';
import { EmployeeController } from '../controllers/employee.controller';
import { LeaveRequestController } from '../controllers/leave-request.controller';
import { AttendanceController } from '../controllers/attendance.controller';

const hrRoutes = new Hono();

hrRoutes.use('*', requirePlan(Plan.ENTERPRISE));
hrRoutes.use('*', requireFeature(FeatureKey.HR));
hrRoutes.use('*', requireModule(MODULE_KEYS.HR));

// Personel
hrRoutes.get('/employees', EmployeeController.list);
hrRoutes.get('/employees/departments', EmployeeController.departments);
hrRoutes.get('/employees/:id', EmployeeController.getById);
hrRoutes.post('/employees', EmployeeController.create);
hrRoutes.patch('/employees/:id', EmployeeController.update);
hrRoutes.delete('/employees/:id', EmployeeController.remove);

// İzin Talepleri
hrRoutes.get('/leave-requests', LeaveRequestController.list);
hrRoutes.get('/leave-requests/:id', LeaveRequestController.getById);
hrRoutes.post('/leave-requests', LeaveRequestController.create);
hrRoutes.post('/leave-requests/:id/approve', LeaveRequestController.approve);
hrRoutes.post('/leave-requests/:id/reject', LeaveRequestController.reject);
hrRoutes.post('/leave-requests/:id/cancel', LeaveRequestController.cancel);

// Puantaj
hrRoutes.get('/attendance', AttendanceController.list);
hrRoutes.post('/attendance/check-in', AttendanceController.checkIn);
hrRoutes.post('/attendance/check-out', AttendanceController.checkOut);
hrRoutes.patch('/attendance/:id', AttendanceController.update);
hrRoutes.delete('/attendance/:id', AttendanceController.remove);

export { hrRoutes };
