import { Request, Response } from "express";
import Controller from "./controller";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import { LoginData } from "@/validation/auth";
import UserService from "@/services/UserService";
import AuthService from "@/services/AuthService";
import { Role } from "@prisma/client";
import config from "@/config";
import { R2P_DISPATCH_ACCESS, R2P_DISPATCH_REFRESH } from "@/middelware/auth";

export default class DispatcherAuthController extends Controller {
    private authService: AuthService = new AuthService();
    private userService: UserService = new UserService();

    public async login(req: ValidatedRequest<LoginData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const data: LoginData = req.validatedBody!;

            const user = await this.userService.find({
                where: { email: data.email },
            });

            if (!user) return new this.ApiError("AUTH_FAILED").send(res);

            const passwordMatch = await this.authService.compareHash(
                data.password,
                user.password
            );

            if (!passwordMatch) return new this.ApiError("AUTH_FAILED").send(res);

            if (!user.phoneVerified) return new this.ApiError("PHONE_NOT_VERIFIED").send(res);

            if (user.role !== Role.DISPATCHER && user.role !== Role.ADMIN) {
                return new this.ApiError("AUTH_FAILED").send(res);
            }

            const accessToken = this.authService.createToken(
                { id: user.id, role: user.role },
                { expiresIn: config.jwt.expiresIn }
            );

            const refreshToken = this.authService.createToken(
                { id: user.id, role: user.role },
                { expiresIn: config.jwt.refresh.expiresIn }
            );

            res.cookie(R2P_DISPATCH_ACCESS, accessToken, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24,
            });

            res.cookie(R2P_DISPATCH_REFRESH, refreshToken, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24 * 7,
            });

            // @ts-ignore
            delete user.password;

            return res.json({ user });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async logout(req: Request, res: Response) {
        try {
            res.clearCookie(R2P_DISPATCH_ACCESS, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                path: "/",
            });

            res.clearCookie(R2P_DISPATCH_REFRESH, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                path: "/",
            });

            return res.json({ message: "Logged out successfully" });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async me(req: Request, res: Response) {
        try {
            const user = await this.userService.find({
                where: { id: req.tokens!.authorization!.payload?.id },
                omit: { password: true },
            });
            return res.json({ user });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }
}
