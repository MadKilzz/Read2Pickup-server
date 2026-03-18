import DispatchController from "@/controllers/DispatchController";
import DispatcherAuthController from "@/controllers/DispatcherAuthController";
import Route from "./route";
import { Role } from "@prisma/client";
import { LoginValidationSchema } from "@/validation/auth";
import { loginLimiter } from "@/rateLimit";
import {
    reassignValidationSchema,
    dispatcherDispatchStatusValidationSchema,
    offerToDriverValidationSchema,
    cancelOfferValidationSchema,
    rejectDriverRequestValidationSchema,
    acceptDriverRequestValidationSchema,
} from "@/validation/dispatch";

export default class DispatchRoute extends Route {
    private controller: DispatchController = new DispatchController();
    private dispatcherAuthController: DispatcherAuthController = new DispatcherAuthController();

    constructor() {
        super();
        this.Init();
    }

    private Init(): void {
        this.router.post(
            "/login",
            [
                loginLimiter,
                this.formMiddelware.validateForm(LoginValidationSchema),
            ],
            this.dispatcherAuthController.login.bind(this.dispatcherAuthController)
        );

        this.router.post(
            "/logout",
            [this.authMiddelware.optionalDispatchAuth],
            this.dispatcherAuthController.logout.bind(this.dispatcherAuthController)
        );

        this.router.get(
            "/me",
            [this.authMiddelware.requireDispatchAuth],
            this.dispatcherAuthController.me.bind(this.dispatcherAuthController)
        );

        this.router.get(
            "/dashboard-stats",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getDashboardStats.bind(this.controller)
        );

        this.router.get(
            "/bookings",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getBookings.bind(this.controller)
        );

        this.router.get(
            "/bookings/:id",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getBooking.bind(this.controller)
        );

        this.router.get(
            "/drivers",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getDrivers.bind(this.controller)
        );

        this.router.post(
            "/bookings/:id/reassign",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
                this.formMiddelware.validateForm(reassignValidationSchema),
            ],
            this.controller.reassignBooking.bind(this.controller)
        );

        this.router.patch(
            "/bookings/:id/dispatch-status",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
                this.formMiddelware.validateForm(dispatcherDispatchStatusValidationSchema),
            ],
            this.controller.patchDispatchStatus.bind(this.controller)
        );

        this.router.post(
            "/bookings/:id/offer",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
                this.formMiddelware.validateForm(offerToDriverValidationSchema),
            ],
            this.controller.offerToDriver.bind(this.controller)
        );

        this.router.post(
            "/bookings/:id/offer/cancel",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
                this.formMiddelware.validateForm(cancelOfferValidationSchema),
            ],
            this.controller.cancelOffer.bind(this.controller)
        );

        this.router.get(
            "/driver-requests",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getDriverRequests.bind(this.controller)
        );

        this.router.get(
            "/driver-requests/:id",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getDriverRequest.bind(this.controller)
        );

        this.router.get(
            "/car-types",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.getCarTypes.bind(this.controller)
        );

        this.router.patch(
            "/driver-requests/:id/reject",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
                this.formMiddelware.validateForm(rejectDriverRequestValidationSchema),
            ],
            this.controller.rejectDriverRequest.bind(this.controller)
        );

        this.router.delete(
            "/driver-requests/:id",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
            ],
            this.controller.removeDriverRequest.bind(this.controller)
        );

        this.router.post(
            "/driver-requests/:id/accept",
            [
                this.authMiddelware.requireDispatchAuth,
                this.authMiddelware.requireRoles([Role.DISPATCHER, Role.ADMIN]),
                this.formMiddelware.validateForm(acceptDriverRequestValidationSchema),
            ],
            this.controller.acceptDriverRequest.bind(this.controller)
        );
    }
}
