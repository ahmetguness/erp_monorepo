CREATE TABLE "admin_saved_list_views" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_saved_list_views_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_saved_list_views_adminId_resource_name_key" ON "admin_saved_list_views"("adminId", "resource", "name");
CREATE INDEX "admin_saved_list_views_adminId_resource_createdAt_idx" ON "admin_saved_list_views"("adminId", "resource", "createdAt");
ALTER TABLE "admin_saved_list_views" ADD CONSTRAINT "admin_saved_list_views_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
