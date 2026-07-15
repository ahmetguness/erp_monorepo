import { z } from 'zod';
export declare const PaginationMetaSchema: z.ZodObject<{
    total: z.ZodNumber;
    page: z.ZodNumber;
    pageSize: z.ZodNumber;
    totalPages: z.ZodNumber;
}, z.core.$strip>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
export declare function PaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T): z.ZodObject<{
    data: z.ZodArray<T>;
    meta: z.ZodObject<{
        total: z.ZodNumber;
        page: z.ZodNumber;
        pageSize: z.ZodNumber;
        totalPages: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare function SingleResponseSchema<T extends z.ZodTypeAny>(itemSchema: T): z.ZodObject<{
    data: T;
}, z.core.$strip>;
