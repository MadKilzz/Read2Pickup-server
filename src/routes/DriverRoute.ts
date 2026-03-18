import Route from "./route";
import {
    acceptOfferValidationSchema,
    declineOfferValidationSchema,
    dispatchStatusValidationSchema,
    driverLocationValidationSchema,
    driverRequestValidationSchema,
    driverStatusValidationSchema,
} from "@/validation/driver";
import DriverController from "@/controllers/DriverController";
import { Role } from "@prisma/client";

export default class DriverRoute extends Route {
    private controller: DriverController = new DriverController();

    constructor() {
        super();
        this.Init()
    }

    private Init(): void {

        this.router.get("/requests/me", [this.authMiddelware.requireAuth], this.controller.getMyRequest.bind(this.controller));

        this.router.post("/requests",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(driverRequestValidationSchema),
            ],
            this.controller.createRequest.bind(this.controller)
        );

        this.router.get("/offers",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER)

            ],
            this.controller.getOffers.bind(this.controller)
        );

        this.router.get("/status",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
            ],
            this.controller.getStatus.bind(this.controller)
        );

        this.router.get("/bookings",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
            ],
            this.controller.getBookings.bind(this.controller)
        );

        this.router.patch("/bookings/:id/dispatch-status",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
                this.formMiddelware.validateForm(dispatchStatusValidationSchema),
            ],
            this.controller.patchDispatchStatus.bind(this.controller)
        );

        this.router.post("/location",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
                this.formMiddelware.validateForm(driverLocationValidationSchema),
            ],
            this.controller.postLocation.bind(this.controller)
        );

        this.router.patch("/status",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
                this.formMiddelware.validateForm(driverStatusValidationSchema),
            ],
            this.controller.patchStatus.bind(this.controller)
        );

        this.router.post("/offers/accept",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
                this.formMiddelware.validateForm(acceptOfferValidationSchema),
            ],
            this.controller.acceptOffer.bind(this.controller)
        );

        this.router.post("/offers/decline",
            [
                this.authMiddelware.requireAuth,
                this.authMiddelware.requireRole(Role.DRIVER),
                this.formMiddelware.validateForm(declineOfferValidationSchema),
            ],
            this.controller.declineOffer.bind(this.controller)
        );
    }
}