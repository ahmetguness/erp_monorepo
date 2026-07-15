"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationMetaSchema = void 0;
exports.PaginatedResponseSchema = PaginatedResponseSchema;
exports.SingleResponseSchema = SingleResponseSchema;
const zod_1 = require("zod");
exports.PaginationMetaSchema = zod_1.z.object({
    total: zod_1.z.number(),
    page: zod_1.z.number(),
    pageSize: zod_1.z.number(),
    totalPages: zod_1.z.number(),
});
function PaginatedResponseSchema(itemSchema) {
    return zod_1.z.object({
        data: zod_1.z.array(itemSchema),
        meta: exports.PaginationMetaSchema,
    });
}
function SingleResponseSchema(itemSchema) {
    return zod_1.z.object({
        data: itemSchema,
    });
}
