import { Request } from "express";

export interface ValidatedRequest<T = any> extends Request {
  validatedBody?: T;
  validatedQuery?: T;
  validationErrors?: { field: string; message: string }[];
}