import bodyParser from "body-parser";
import { CreatePaySessionValidationSchema, BillingAddressValidationSchema, CreateCompanyProfileValidationSchema, UpdateCompanyProfileValidationSchema } from "@/validation/billing";
import Route from "./route";
import BillingController from "@/controllers/BillingController";

export default class BillingRouter extends Route {
    private controller: BillingController = new BillingController();

    constructor() {
        super();
        this.Init()
    }

    private Init(): void {
        this.router.get(
            "/payment-methods",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.PaymentMethods.bind(this.controller)
        );

        this.router.post(
            "/create-booking-checkout",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(CreatePaySessionValidationSchema)
            ],
            this.controller.CreatePaySession.bind(this.controller)
        );

        this.router.get(
            "/sessions/:sessionId",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getSession.bind(this.controller)
        );

        // 🔔 Webhook (GEEN auth middleware)
        this.router.post(
            "/events",
            bodyParser.raw({ type: "application/json" }),
            this.controller.HandleBillingEvents.bind(this.controller)
        );

        this.router.post(
            "/address",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(BillingAddressValidationSchema)
            ],
            this.controller.updateBillingAddress.bind(this.controller)
        );

        this.router.get(
            "/address",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getBillingAddress.bind(this.controller)
        );

        this.router.post(
            "/payment-methods/:paymentMethodId/set-default",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.setDefaultPaymentMethod.bind(this.controller)
        );

        this.router.delete(
            "/payment-methods/:paymentMethodId",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.deletePaymentMethod.bind(this.controller)
        );

        this.router.post(
            "/setup-intent",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.createSetupIntent.bind(this.controller)
        );

        this.router.post(
            "/setup-intent/confirm",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.confirmSetupIntent.bind(this.controller)
        );

        this.router.get(
            "/profiles",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.getCompanyProfiles.bind(this.controller)
        );

        this.router.post(
            "/profiles",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(CreateCompanyProfileValidationSchema)
            ],
            this.controller.createCompanyProfile.bind(this.controller)
        );

        this.router.patch(
            "/profiles/:id",
            [
                this.authMiddelware.requireAuth,
                this.formMiddelware.validateForm(UpdateCompanyProfileValidationSchema)
            ],
            this.controller.updateCompanyProfile.bind(this.controller)
        );

        this.router.delete(
            "/profiles/:id",
            [
                this.authMiddelware.requireAuth
            ],
            this.controller.deleteCompanyProfile.bind(this.controller)
        );
    }
}