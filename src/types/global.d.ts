import { JwtPayload } from "jsonwebtoken";

declare global {
    namespace Express {
        interface Request {
            validatedBody?: any;
            validationErrors?: { field: string; message: string }[];
            tokens: {
                authorization: {
                    value?: string;
                    payload?: JwtPayload;
                },
                refresh: {
                    value?: string;
                    payload?: JwtPayload;
                }
            }
        }
    }
}
