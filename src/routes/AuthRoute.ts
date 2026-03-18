import AuthController from "@/controllers/AuthController";
import Route from "./route";
import { LoginValidationSchema, OtpValidationSchema, ChangePasswordValidationSchema, UpdateProfileValidationSchema } from "@/validation/auth";
import { loginLimiter, authStrictLimiter } from "@/rateLimit";

export default class AuthRouter extends Route {
    private controller: AuthController = new AuthController();

    constructor() {
        super();
        this.Init()
    }

    private Init(): void {
        this.router.post(
            "/login",
            [
                loginLimiter,
                this.formMiddelware.validateForm(LoginValidationSchema)
            ],
            this.controller.login.bind(this.controller)
        );

        this.router.post(
            "/logout",
            [this.authMiddelware.optionalAuth],
            this.controller.logout.bind(this.controller)
        );

        this.router.post(
            "/register",
            [
                authStrictLimiter,
                this.formMiddelware.RegisterValidationSchema
            ],
            this.controller.register.bind(this.controller)
        );

        this.router.post(
            "/otp",
            [
                authStrictLimiter,
                this.formMiddelware.validateForm(OtpValidationSchema)
            ],
            this.controller.verifyOtp.bind(this.controller)
        );

        this.router.post(
            "/",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.isAuthenticated.bind(this.controller)
        );

        this.router.put(
            "/profile",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(UpdateProfileValidationSchema)
            ],
            this.controller.updateProfile.bind(this.controller)
        );

        this.router.post(
            "/change-password",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(ChangePasswordValidationSchema)
            ],
            this.controller.changePassword.bind(this.controller)
        );
    }
}