import BookController from "@/controllers/BookController";
import Route from "./route";
import { BookingDraftValidationSchema, cancelBookingValidationSchema, PatchDraftValidationSchema, patchBookingValidationSchema, rebookValidationSchema } from "@/validation/auth";

export default class BookRouter extends Route {
    private controller: BookController = new BookController();

    constructor() {
        super();
        this.Init()
    }

    private Init(): void {

        this.router.get(
            "/",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getBookings.bind(this.controller)
        )

        this.router.get(
            "/summary",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getBookingSummary.bind(this.controller)
        )

        this.router.post(
            "/cancel",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(cancelBookingValidationSchema)
            ],
            this.controller.cancelBooking.bind(this.controller)
        )

        this.router.post(
            "/:id/rebook",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(rebookValidationSchema)
            ],
            this.controller.rebookBooking.bind(this.controller)
        )

        this.router.get(
            "/:id",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getBooking.bind(this.controller)
        )

        this.router.get(
            "/:id/invoice",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getBookingInvoice.bind(this.controller)
        )

        this.router.patch(
            "/:id",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(patchBookingValidationSchema)
            ],
            this.controller.patchBooking.bind(this.controller)
        )

        this.router.post(
            "/draft",
            [
                this.formMiddelware.validateForm(BookingDraftValidationSchema),
                this.authMiddelware.optionalAuth
            ],
            this.controller.draft.bind(this.controller)
        );

        this.router.get(
            "/draft/:id",
            [
                this.authMiddelware.optionalAuth
            ],
            this.controller.fetchDraft.bind(this.controller)
        );

        this.router.patch(
            "/draft/:id",
            [
                this.authMiddelware.optionalAuth,
                this.formMiddelware.validateForm(PatchDraftValidationSchema)
            ],
            this.controller.patchDraft.bind(this.controller)
        );

    }
}