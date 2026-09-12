CREATE TABLE "admin_ui_preferences" (
  "adminId" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'tr-TR',
  "highContrast" BOOLEAN NOT NULL DEFAULT false,
  "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
  "density" TEXT NOT NULL DEFAULT 'COMFORTABLE',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_ui_preferences_pkey" PRIMARY KEY ("adminId")
);
