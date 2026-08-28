ALTER TABLE "approval_flows" ADD COLUMN "conditions" JSONB;
ALTER TABLE "approval_requests" ADD COLUMN "context" JSONB;
