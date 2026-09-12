ALTER TABLE "admin_ui_preferences"
ADD CONSTRAINT "admin_ui_preferences_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "admin_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
