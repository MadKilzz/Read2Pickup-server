import AuthService from "@/services/AuthService";
import UserService from "@/services/UserService";
import ApiError from "@/utils/ApiError";
import config from "@/config";
import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";

const authService = new AuthService();
const userService = new UserService();

/**
 * Veilig token verifiëren, geeft undefined als token niet geldig is
 */
export async function safeVerify(token?: string): Promise<JwtPayload | undefined> {
    if (!token) return undefined;

    try {
        return authService.verify(token);
    } catch (e: any) {
        return undefined;
    }
}

const cookieOptions = {
    httpOnly: true,
    secure: config.app.isProduction,
    sameSite: "lax" as const,
    maxAge: 1000 * 60 * 60 * 24,
};

/** Cookie names for dispatch panel (separate session from main site) */
export const R2P_DISPATCH_ACCESS = "R2P_dispatch_access";
export const R2P_DISPATCH_REFRESH = "R2P_dispatch_refresh";

/** Resultaat van tryRefresh: payload en nieuw access token */
export type RefreshResult = { payload: JwtPayload; accessToken: string } | undefined;

/**
 * Probeert met een refresh token een nieuw access token te maken.
 * Geeft bij succes { payload, accessToken } terug, anders undefined.
 * Zet geen cookie; voor HTTP gebruik tryRefreshFromCookie.
 */
export async function tryRefresh(refreshToken: string): Promise<RefreshResult> {
    if (!refreshToken) return undefined;

    const payload = await safeVerify(refreshToken) as (JwtPayload & { id?: string; role?: Role }) | undefined;
    if (!payload?.id) return undefined;

    const user = await userService.find({ where: { id: payload.id } });
    if (!user) return undefined;

    const accessToken = authService.createToken(
        { id: user.id, role: user.role },
        { expiresIn: config.jwt.expiresIn }
    );

    return {
        payload: { ...payload, id: user.id, role: user.role } as JwtPayload,
        accessToken,
    };
}

/**
 * Probeert een nieuwe access token te zetten via de refresh cookie.
 * Geeft bij succes { payload, accessToken } terug, anders undefined.
 * Zet de nieuwe access token cookie op res.
 */
async function tryRefreshFromCookie(req: Request, res: Response): Promise<RefreshResult> {
    const refreshToken = req.cookies?.R2P_refresh;
    if (!refreshToken) return undefined;

    const result = await tryRefresh(refreshToken);
    if (!result) return undefined;

    res.cookie("R2P_access", result.accessToken, cookieOptions);
    return result;
}

/** Haal access token uit cookie of Authorization: Bearer header (voor o.a. driver app). */
function getAccessToken(req: Request): string | undefined {
    const cookie = req.cookies?.R2P_access;
    if (cookie) return cookie;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice(7);
    return undefined;
}

/** Haal access token voor dispatch panel uit dispatch cookie (geen Bearer). */
function getDispatchAccessToken(req: Request): string | undefined {
    return req.cookies?.[R2P_DISPATCH_ACCESS];
}

/**
 * Probeert een nieuwe access token te zetten via de dispatch refresh cookie.
 * Zet de nieuwe access token cookie (R2P_dispatch_access) op res.
 */
async function tryRefreshFromDispatchCookie(req: Request, res: Response): Promise<RefreshResult> {
    const refreshToken = req.cookies?.[R2P_DISPATCH_REFRESH];
    if (!refreshToken) return undefined;

    const result = await tryRefresh(refreshToken);
    if (!result) return undefined;

    res.cookie(R2P_DISPATCH_ACCESS, result.accessToken, cookieOptions);
    return result;
}

export const authMiddleware = {
    /**
     * 🔹 STRICT: token verplicht.
     * Als access token ontbreekt of verlopen is, wordt automatisch geprobeerd
     * te refreshen via de R2P_refresh cookie; bij succes gaat de request door.
     * Token kan uit cookie (R2P_access) of uit Authorization: Bearer header komen.
     */
    requireAuth: async (req: Request, res: Response, next: NextFunction) => {
        let accessToken = getAccessToken(req);
        let payload = await safeVerify(accessToken);

        if (!payload) {
            const refreshed = await tryRefreshFromCookie(req, res);
            if (!refreshed) return new ApiError("NO_AUTHENTICATION").send(res);
            payload = refreshed.payload;
            accessToken = refreshed.accessToken;
        }

        req.tokens = {
            authorization: { value: accessToken ?? undefined, payload },
            refresh: { value: undefined, payload: undefined },
        };

        next();
    },

    /**
     * 🔹 Optioneel token.
     * Zelfde auto-refresh: als alleen refresh cookie geldig is, wordt access token gezet.
     */
    optionalAuth: async (req: Request, res: Response, next: NextFunction) => {
        let accessToken = getAccessToken(req);
        let payload = await safeVerify(accessToken);

        if (!payload) {
            const refreshed = await tryRefreshFromCookie(req, res);
            if (refreshed) {
                payload = refreshed.payload;
                accessToken = refreshed.accessToken;
            }
        }

        req.tokens = {
            authorization: { value: accessToken ?? undefined, payload },
            refresh: { value: undefined, payload: undefined },
        };

        next();
    },

    /**
     * 🔹 Vereist specifieke rol
     */
    requireRole: (role: Role) => {
        return (req: Request, res: Response, next: NextFunction) => {
            const payload = req.tokens?.authorization?.payload;
            if (!payload) return new ApiError("NO_AUTHENTICATION").send(res);
            if (!payload.role) return new ApiError("INVALID_TOKEN").send(res);

            if (payload.role !== role) return new ApiError("REQUEST_NOT_ALLOWED").send(res);

            next();
        };
    },

    /**
     * 🔹 Vereist een van de gegeven rollen (bv. DISPATCHER of ADMIN voor dispatch-routes)
     */
    requireRoles: (roles: Role[]) => {
        return (req: Request, res: Response, next: NextFunction) => {
            const payload = req.tokens?.authorization?.payload;
            if (!payload) return new ApiError("NO_AUTHENTICATION").send(res);
            if (!payload.role) return new ApiError("INVALID_TOKEN").send(res);

            if (!roles.includes(payload.role as Role)) return new ApiError("REQUEST_NOT_ALLOWED").send(res);

            next();
        };
    },

    /**
     * 🔹 Dispatch panel: token verplicht via dispatch cookies (R2P_dispatch_access, R2P_dispatch_refresh).
     * Geen Bearer; aparte sessie van de hoofd-site.
     */
    requireDispatchAuth: async (req: Request, res: Response, next: NextFunction) => {
        let accessToken = getDispatchAccessToken(req);
        let payload = await safeVerify(accessToken);

        if (!payload) {
            const refreshed = await tryRefreshFromDispatchCookie(req, res);
            if (!refreshed) return new ApiError("NO_AUTHENTICATION").send(res);
            payload = refreshed.payload;
            accessToken = refreshed.accessToken;
        }

        req.tokens = {
            authorization: { value: accessToken ?? undefined, payload },
            refresh: { value: undefined, payload: undefined },
        };

        next();
    },

    /**
     * 🔹 Dispatch panel: optioneel token via dispatch cookies.
     */
    optionalDispatchAuth: async (req: Request, res: Response, next: NextFunction) => {
        let accessToken = getDispatchAccessToken(req);
        let payload = await safeVerify(accessToken);

        if (!payload) {
            const refreshed = await tryRefreshFromDispatchCookie(req, res);
            if (refreshed) {
                payload = refreshed.payload;
                accessToken = refreshed.accessToken;
            }
        }

        req.tokens = {
            authorization: { value: accessToken ?? undefined, payload },
            refresh: { value: undefined, payload: undefined },
        };

        next();
    },
};
