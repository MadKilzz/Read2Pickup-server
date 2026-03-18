import { ValidatedRequest } from '@/types/ValidatedRequest';
import ApiError from '@/utils/ApiError';
import { RegisterData, RegisterValidationSchema } from '@/validation/auth';
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';

export const formMiddelware = {
    RegisterValidationSchema: (req: ValidatedRequest<RegisterData>, res: Response, next: NextFunction): Response | void => {

        try {
            const data = RegisterValidationSchema.parse(req.body);
            req.validatedBody = data;
            return next();
        } catch (err: any) {

            switch (err.name) {
                case "ZodError":
                    req.validationErrors = (err as ZodError).issues.map((e) => ({
                        field: e.path[0] as string,
                        message: e.message,
                    }));
                    return next();
                default:
                    return new ApiError("INCORRECT_BODY").send(res);
            }
        }
    },

    validateForm<T>(schema: ZodSchema<T>) {
        return (req: ValidatedRequest<T>, res: Response, next: NextFunction): void | Response => {
            try {
                const data = schema.parse(req.body);
                req.validatedBody = data;
                return next();
            } catch (err: any) {
                if (err instanceof ZodError) {
                    req.validationErrors = err.issues.map((issue) => ({
                        field: issue.path[0] as string,
                        message: issue.message,
                    }));
                    return next();
                }
                return new ApiError("INCORRECT_BODY").send(res);
            }
        };
    },
    validateQuery<T>(schema: ZodSchema<T>) {
        return (req: ValidatedRequest<T>, res: Response, next: NextFunction): void | Response => {
            try {
                const data = schema.parse(req.query);
                req.validatedQuery = data;
                return next();
            } catch (err: any) {
                if (err instanceof ZodError) {
                    req.validationErrors = err.issues.map((issue) => ({
                        field: issue.path[0] as string,
                        message: issue.message,
                    }));
                    return next();
                }
                return new ApiError("INCORRECT_BODY").send(res);
            }
        };
    },

}