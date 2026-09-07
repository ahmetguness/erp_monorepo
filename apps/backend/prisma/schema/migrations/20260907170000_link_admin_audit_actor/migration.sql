ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "admin_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
