import { Request, Response } from "express";
import Controller from "./controller";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import { LoginData, OtpData, RegisterData, RegisterValidationSchema, ChangePasswordData, UpdateProfileData } from "@/validation/auth";

import UserService from "@/services/UserService";
import OtpService from "@/services/OtpService";
import AuthService from "@/services/AuthService";
import DeviceTokenService from "@/services/DeviceTokenService";
import { DriverStatus, Role } from "@prisma/client";
import config from "@/config";
import errors from "@/constants/errors";

export default class AuthController extends Controller {
    private authService: AuthService = new AuthService();
    private userService: UserService = new UserService();
    private otpService: OtpService = new OtpService();
    private deviceTokenService: DeviceTokenService = new DeviceTokenService();

    public async login(req: ValidatedRequest<LoginData>, res: Response) {

        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const data: LoginData = req.validatedBody!;

            const user = await this.userService.find({
                where: { email: data.email }
            })

            if (!user) return new this.ApiError('AUTH_FAILED').send(res);

            const passwordMatch = await this.authService.compareHash(
                data.password,
                user.password
            );

            if (!passwordMatch) return new this.ApiError('AUTH_FAILED').send(res);


            if (!user.phoneVerified) return new this.ApiError('PHONE_NOT_VERIFIED').send(res); // TODO

            const appHeader = req.headers['x-app-info'] as string | undefined;

            if (appHeader?.includes("Ready2PickupAdmin") && user.role !== Role.ADMIN) return new this.ApiError('AUTH_FAILED').send(res);

            if (appHeader?.includes("Ready2PickupDispatch") && user.role !== Role.DISPATCHER && user.role !== Role.ADMIN) return new this.ApiError('AUTH_FAILED').send(res);

            if (appHeader?.includes("Ready2PickupDriverApp") && user.role !== Role.DRIVER) return new this.ApiError('AUTH_FAILED').send(res);

            /*
            if (appHeader?.includes("Ready2PickupDispatch")) {
                const driver = await this.driverService.find({ where: { id: user.id } });
                if (!driver) {
                    return new this.ApiError('USER_NOT_FOUND').send(res);
                }
            }
                */
            /*
            if (appHeader?.includes("Ready2PickupDriverApp")) {
                const driver = await this.driverService.find({ where: { id: user.id } });
                if (!driver) {
                    return new this.ApiError('USER_NOT_FOUND').send(res);
                }
            }

            */

            const accessToken = this.authService.createToken(
                { id: user.id, role: user.role },
                { expiresIn: config.jwt.expiresIn }
            );

            const refreshToken = this.authService.createToken(
                { id: user.id, role: user.role },
                { expiresIn: config.jwt.refresh.expiresIn }
            );

            // Access cookie
            res.cookie("R2P_access", accessToken, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24
            });

            // Refresh cookie
            res.cookie("R2P_refresh", refreshToken, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24 * 7
            });

            // Device token (driver app): opslaan of updaten, revokedAt op null
            const isDriverApp = appHeader?.includes("Ready2PickupDriverApp") && user.role === Role.DRIVER;
            if (isDriverApp && data.deviceToken) {
                try {
                    await this.deviceTokenService.upsert({
                        where: {
                            userId_deviceToken: { userId: user.id, deviceToken: data.deviceToken },
                        },
                        create: {
                            id: this.SnowFlake.generate(),
                            userId: user.id,
                            deviceToken: data.deviceToken,
                            platform: data.platform ?? null,
                        },
                        update: {
                            platform: data.platform ?? undefined,
                            revokedAt: null,
                        },
                    });
                } catch (e: unknown) {
                    this.logger.error("DeviceToken upsert failed", e instanceof Error ? e : new Error(String(e)));
                }
            }

            // @ts-ignore
            delete user.password

            // Driver app: return accessToken in body so the app can store it and send Bearer header
            if (isDriverApp) {
                console.log({ user, accessToken })
                return res.json({ user, accessToken });
            }
            return res.json({ user });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }

    }

    public async logout(req: Request, res: Response) {
        try {
            const userId = req.tokens?.authorization?.payload?.id;
            if (userId) {
                // Don't rely on JWT role claim here; use current DB state.
                const user = await this.userService.find({
                    where: { id: userId },
                    include: { Driver: true },
                }) as any;
                const isDriver = user?.role === Role.DRIVER;
                const driverStatus = user?.Driver?.[0]?.status as DriverStatus | undefined;
                if (isDriver && driverStatus === DriverStatus.ON_BOOKING) {
                    throw new this.ApiError("LOGOUT_NOT_ALLOWED_ON_BOOKING");
                }
                await this.deviceTokenService.revokeAllForUser(userId);
            }

            res.clearCookie("R2P_access", {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                path: "/",
            });

            res.clearCookie("R2P_refresh", {
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

    public async register(req: ValidatedRequest<RegisterData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const data: RegisterData = req.validatedBody!;

            const existingUser = await this.userService.find({
                where: {
                    OR: [
                        { email: data.email },
                        { phone: data.phone }
                    ]
                }
            });

            if (existingUser) return new this.ApiError("ACCOUNT_ALREADY_EXISTS").send(res);


            const user = await this.userService.create({
                data: {
                    id: this.SnowFlake.generate(),
                    firstname: data.firstname,
                    lastname: data.lastname,
                    email: data.email,
                    password: this.authService.hash(data.password),
                    phone: data.phone,
                    gender: data.gender
                }
            });

            if (!user) return new this.ApiError('UNKNOWN_ERROR').send(res);

            const { otpCode, expiresAt } = this.otpService.generate();

            const otp = await this.otpService.upsert({
                where: { userId: user.id },
                update: {
                    userId: user.id,
                    code: otpCode,
                    expiresAt
                },
                create: {
                    id: this.SnowFlake.generate(),
                    userId: user.id,
                    code: otpCode,
                    expiresAt
                }
            })

            /*
            const otp_old = await this.otpService.create({
                data: {
                    id: this.SnowFlake.generate(),
                    userId: user.id,
                    code: otpCode,
                    expiresAt
                }
            });
            */

            console.log("DEV OTPCODE", {
                code: otp.code,
                expire: otp.expiresAt
            })

            return res.json({
                code: 200,
                message: "OTP sent successfully.",
                data: {
                    expiry: expiresAt
                }
            })
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async verifyOtp(req: ValidatedRequest<OtpData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const { email, otp } = req.validatedBody!;
            const user = await this.userService.find({ where: { email: email }, omit: { password: true } });

            if (!user) return new this.ApiError("USER_NOT_FOUND").send(res);

            const isValidOtp = await this.otpService.verify(user.id, otp);
            if (!isValidOtp.success) return new this.ApiError("INVALID_OR_EXPIRED_OTP").send(res);

            const paymentCustomerId = user.paymentCustomerId ?? (await this.Stripe.customers.create({
                email: user.email,
                name: `${user.firstname} ${user.lastname}`,
                metadata: { userId: user.id }
            })).id;

            const updatedUser = this.userService.update({
                where: {
                    id: user.id
                },
                data: {
                    phoneVerified: true,
                    paymentCustomerId
                }
            })

            if (!updatedUser) return new this.ApiError('UNKNOWN_ERROR').send(res);

            const accessToken = this.authService.createToken(
                { id: user.id, role: user.role },
                { expiresIn: config.jwt.expiresIn }
            );

            const refreshToken = this.authService.createToken(
                { id: user.id, role: user.role },
                { expiresIn: config.jwt.refresh.expiresIn }
            );

            // Access cookie
            res.cookie("R2P_access", accessToken, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24
            });

            // Refresh cookie
            res.cookie("R2P_refresh", refreshToken, {
                httpOnly: true,
                secure: config.app.isProduction,
                sameSite: "lax",
                maxAge: 1000 * 60 * 60 * 24 * 7
            });

            return res.json({
                code: 200,
                message: "OTP verified successfully.",
                data: {
                    user
                }
            })

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async isAuthenticated(req: Request, res: Response) {
        try {

            const user = await this.userService.find({
                where: { id: req.tokens.authorization.payload?.id },
                omit: { password: true }
            })
            return res.json({ user })

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async changePassword(req: ValidatedRequest<ChangePasswordData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const data: ChangePasswordData = req.validatedBody!;

            const user = await this.userService.find({
                where: { id: userId }
            });

            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            const passwordMatch = await this.authService.compareHash(
                data.currentPassword,
                user.password
            );

            if (!passwordMatch) return new this.ApiError('INVALID_PASSWORD').send(res);

            const updatedUser = await this.userService.update({
                where: { id: userId },
                data: {
                    password: this.authService.hash(data.newPassword)
                }
            });

            if (!updatedUser) return new this.ApiError('UNKNOWN_ERROR').send(res);

            return res.json({
                code: 200,
                message: "Password updated successfully."
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async updateProfile(req: ValidatedRequest<UpdateProfileData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const data: UpdateProfileData = req.validatedBody!;

            const user = await this.userService.find({
                where: { id: userId }
            });

            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            if (user.paymentCustomerId) await this.Stripe.customers.update(user.paymentCustomerId, {
                name: `${data.firstname} ${data.lastname}`,
            });

            const updatedUser = await this.userService.update({
                where: { id: userId },
                data: {
                    firstname: data.firstname,
                    lastname: data.lastname,
                }
            });

            if (!updatedUser) return new this.ApiError('UNKNOWN_ERROR').send(res);

            return res.json({
                code: 200,
                message: "Profile updated successfully.",
                data: {
                    firstname: updatedUser.firstname,
                    lastname: updatedUser.lastname,
                },
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }
}