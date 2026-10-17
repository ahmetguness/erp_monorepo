import { Hono } from "hono";
import { getValidatedBody } from "../middleware/validateBody.js";
import {
  checkoutQuoteSchema,
  completeCheckoutSchema,
  completeTenantCheckout,
  getTenantCheckoutContext,
  quoteTenantCheckout,
} from "../modules/platform/application/index.js";
export const tenantCheckoutRoutes = new Hono();
tenantCheckoutRoutes.get("/context", async (c) =>
  c.json({
    data: await getTenantCheckoutContext(c.get("tenantId"), c.get("userId")),
  }),
);
tenantCheckoutRoutes.post("/quote", async (c) =>
  c.json({
    data: await quoteTenantCheckout(
      c.get("tenantId"),
      c.get("userId"),
      getValidatedBody(c, checkoutQuoteSchema),
    ),
  }),
);
tenantCheckoutRoutes.post("/complete", async (c) =>
  c.json({
    data: await completeTenantCheckout(
      c.get("tenantId"),
      c.get("userId"),
      getValidatedBody(c, completeCheckoutSchema),
    ),
  }),
);
