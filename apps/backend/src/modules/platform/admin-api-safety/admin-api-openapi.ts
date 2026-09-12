export const adminApiOpenApi = {
  openapi: "3.1.0",
  info: { title: "Axon ERP Admin API", version: "1.0.0" },
  paths: {
    "/api/admin/tenants/{id}": {
      patch: {
        summary: "Tenant ayarlarını eşzamanlılık korumasıyla günceller",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 120 },
          },
        ],
        responses: {
          "200": { description: "Güncellendi" },
          "400": { description: "Geçersiz istek" },
          "409": { description: "Idempotency veya eşzamanlılık çakışması" },
        },
      },
    },
    "/api/admin/tenants/bulk-note": {
      post: {
        summary: "Tenant operasyon notunu güvenli toplu uygular",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Kayıt bazlı sonuç" },
          "409": { description: "Idempotency çakışması" },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              fields: {
                type: "object",
                additionalProperties: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;
