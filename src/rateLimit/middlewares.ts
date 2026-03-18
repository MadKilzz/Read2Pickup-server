import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request, Response } from "express";
import ApiError from "@/utils/ApiError";
import config from "@/config";
import { createRateLimitStore } from "./store";

const { globalLimit, globalWindowMs, authLimit, authWindowMs, loginLimit } = config.rateLimit;

function rateLimitHandler(_req: Request, res: Response) {
    return new ApiError("RATE_LIMIT").send(res);
}

/** Global API rate limit: applies to all routes except skipped paths. */
export const globalLimiter = rateLimit({
    windowMs: globalWindowMs,
    limit: globalLimit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    skip: (req, _res) => {
        if (req.path === "/api/health") return true;
        if (req.path === "/billing/events") return true;
        return false;
    },
    store: createRateLimitStore(),
});

/** Login: strict limit per IP+email, only failed attempts count. */
export const loginLimiter = rateLimit({
    windowMs: authWindowMs,
    limit: loginLimit,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
        const ipPart = ipKeyGenerator(req.ip || "");
        const emailPart = (req.body as { email?: string })?.email || "unknown";
        return `${ipPart}-${emailPart}`;
    },
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore(),
});

/** Register & OTP: limit per IP to prevent abuse and SMS/email cost. */
export const authStrictLimiter = rateLimit({
    windowMs: authWindowMs,
    limit: authLimit,
    keyGenerator: (req: Request) => ipKeyGenerator(req.ip || ""),
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore(),
});
