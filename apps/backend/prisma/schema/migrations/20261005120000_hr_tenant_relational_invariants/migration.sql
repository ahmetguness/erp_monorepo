CREATE UNIQUE INDEX "employees_tenantId_id_key" ON "employees"("tenantId", "id");
CREATE UNIQUE INDEX "payrolls_tenantId_id_key" ON "payrolls"("tenantId", "id");

ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_employeeId_fkey";
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenantId_employeeId_fkey"
  FOREIGN KEY ("tenantId", "employeeId") REFERENCES "employees"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendances" DROP CONSTRAINT "attendances_employeeId_fkey";
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_tenantId_employeeId_fkey"
  FOREIGN KEY ("tenantId", "employeeId") REFERENCES "employees"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_employeeId_fkey";
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_tenantId_employeeId_fkey"
  FOREIGN KEY ("tenantId", "employeeId") REFERENCES "employees"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_items" DROP CONSTRAINT "payroll_items_payrollId_fkey";
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_tenantId_payrollId_fkey"
  FOREIGN KEY ("tenantId", "payrollId") REFERENCES "payrolls"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
