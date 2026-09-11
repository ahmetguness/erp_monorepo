CREATE TABLE "platform_incidents" (
  "id" TEXT NOT NULL, "alertId" TEXT, "title" TEXT NOT NULL, "summary" TEXT NOT NULL,
  "severity" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'INVESTIGATING', "owner" TEXT NOT NULL,
  "runbookUrl" TEXT NOT NULL, "rootCause" TEXT, "resolution" TEXT, "createdById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "platform_incidents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "platform_incident_tenants" (
  "incidentId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_incident_tenants_pkey" PRIMARY KEY ("incidentId", "tenantId")
);
CREATE TABLE "platform_incident_timeline" (
  "id" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "type" TEXT NOT NULL, "message" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_incident_timeline_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "platform_incident_communications" (
  "id" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', "recipientCount" INTEGER NOT NULL,
  "requestedById" TEXT NOT NULL, "approvedById" TEXT, "decisionNote" TEXT, "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_incident_communications_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "platform_incident_tenants" ADD CONSTRAINT "platform_incident_tenants_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "platform_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_incident_timeline" ADD CONSTRAINT "platform_incident_timeline_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "platform_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_incident_communications" ADD CONSTRAINT "platform_incident_communications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "platform_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "platform_incidents_status_severity_createdAt_idx" ON "platform_incidents"("status", "severity", "createdAt");
CREATE INDEX "platform_incidents_alertId_idx" ON "platform_incidents"("alertId");
CREATE INDEX "platform_incident_tenants_tenantId_idx" ON "platform_incident_tenants"("tenantId");
CREATE INDEX "platform_incident_timeline_incidentId_createdAt_idx" ON "platform_incident_timeline"("incidentId", "createdAt");
CREATE INDEX "platform_incident_communications_incidentId_status_createdAt_idx" ON "platform_incident_communications"("incidentId", "status", "createdAt");
CREATE INDEX "platform_incident_communications_status_createdAt_idx" ON "platform_incident_communications"("status", "createdAt");
