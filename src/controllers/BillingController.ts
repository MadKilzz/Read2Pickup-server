import { Request, Response } from "express";
import Controller from "./controller";
import UserService from "@/services/UserService";
import { StripeClient } from "@/utils/stripe";
import BookService from "@/services/BookService";
import { CreatePaySessionData, BillingAddressData, CreateCompanyProfileData, UpdateCompanyProfileData } from "@/validation/billing";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import { BookingDraft, CarType, DraftStatus } from "@prisma/client";
import config from "@/config";
import BillingService from "@/services/BillingService";
import CompanyProfileService from "@/services/CompanyProfileService";
import Stripe from "stripe";

export default class BillingController extends Controller {
    private userService: UserService = new UserService();
    private bookService: BookService = new BookService();
    private billingService: BillingService = new BillingService();
    private companyProfileService: CompanyProfileService = new CompanyProfileService();

    public async PaymentMethods(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload!.id
            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            })
            if (!user) return new this.ApiError('UNKNOWN_ERROR').send(res);
            if (!user.paymentCustomerId) return new this.ApiError('UNKNOWN_ERROR').send(res);

            const customer = await StripeClient.customers.retrieve(user.paymentCustomerId);
            if (customer.deleted) return new this.ApiError('UNKNOWN_ERROR').send(res);

            const [cards, revolut, paypal] = await Promise.all([
                StripeClient.paymentMethods.list({ customer: user.paymentCustomerId, type: "card" }),
                StripeClient.paymentMethods.list({ customer: user.paymentCustomerId, type: "revolut_pay" }),
                StripeClient.paymentMethods.list({ customer: user.paymentCustomerId, type: "paypal" }),
            ]);

            const allPaymentMethods = [...cards.data, ...revolut.data, ...paypal.data];
            const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;

            return res.json({
                paymentMethods: allPaymentMethods,
                defaultPaymentMethodId: defaultPaymentMethodId || null
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async CreatePaySession(req: ValidatedRequest<CreatePaySessionData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization.payload!.id;
            const { draftId }: CreatePaySessionData = req.validatedBody!;

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            })
            if (!user || !user.paymentCustomerId) return new this.ApiError('REQUEST_NOT_ALLOWED').send(res);

            const draft = await this.bookService.fetchDraft({
                where: { id: draftId, userId: user.id, expiresAt: { gt: new Date() }, status: { notIn: [DraftStatus.EXPIRED, DraftStatus.PAID] } },
                include: { CarType: true }
            }) as (BookingDraft & { CarType: CarType }) | null;

            if (!draft || draft && !draft.CarType) return new this.ApiError('DRAFT_NOT_FOUND').send(res);

            if (draft.status === DraftStatus.PAYMENT_IN_PROGRESS && draft.paymentSessionId) {
                const existingSession = await StripeClient.checkout.sessions.retrieve(draft.paymentSessionId);

                if (!existingSession || existingSession.status !== "open") return new this.ApiError('DRAFT_NOT_FOUND').send(res);

                return res.json({
                    checkoutUrl: existingSession.url,
                    reused: true,
                });
            }

            //handle status

            const routeData = await this.bookService.getRouteData(
                draft.startLat, draft.startLng,
                draft.endLat, draft.endLng
            );

            const price = this.bookService.calculateRidePrice(
                {
                    distanceMeters: draft.distanceMeters,
                    baseFare: draft.CarType.baseFare,
                    pricePerKm: draft.CarType.pricePerKm,
                    pricePerMin: draft.CarType.pricePerMin,
                    durationSeconds: draft.durationSeconds,
                },
                {
                    minimumFareReservation: draft.CarType.minimumReservationFare,
                    shortReservationThresholdKm: draft.CarType.shortReservationKm,
                    longRideNoTimeThresholdKm: draft.CarType.longRideNoTimeKm,
                }
            );
            const priceInCents = Math.round(price * 100);

            const session = await StripeClient.checkout.sessions.create({
                mode: "payment",
                customer: user.paymentCustomerId,
                payment_method_types: ["card", "ideal", "paypal", "revolut_pay"],
                line_items: [
                    {
                        price_data: {
                            currency: "eur",
                            product_data: {
                                name: `Ready2Pickup ${draft.CarType.name} ride.`,
                            },
                            unit_amount: priceInCents
                        },
                        quantity: 1
                    }
                ],
                metadata: {
                    draftId: draft.id,
                    userId: draft.userId
                },
                success_url: `${config.app.url}/book/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${config.app.url}/book/${draft.id}?success=false`,
            });

            const updated = await this.bookService.updateDraft({
                where: { id: draft.id },
                data: {
                    status: DraftStatus.PAYMENT_IN_PROGRESS,
                    paymentSessionId: session.id,
                }
            })

            if (!updated) throw new Error("FAILED_TO_UPDATE_DRAFT_WITH_SESSION");


            return res.json({
                checkoutUrl: session.url,
                reused: false,
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async getSession(req: Request, res: Response) {
        try {
            const sessionId = req.params.sessionId;

            const session = await StripeClient.checkout.sessions.retrieve(sessionId);
            if (!session) return new this.ApiError("SESSION_NOT_FOUND").send(res);

            const bookingId = await this.billingService.getBookingIdByPaymentSessionId(session.id);

            return res.json({
                ...session.metadata,
                payment_status: session.payment_status,
                bookingId: bookingId ?? undefined,
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async HandleBillingEvents(req: Request, res: Response) {
        try {
            const event = this.billingService.verifyWebhook(req);
            const session = event.data.object as Stripe.Checkout.Session;

            switch (event.type) {
                case "checkout.session.completed":
                    // Handle payment mode (booking checkout)
                    if (session.mode === "payment" && session.payment_status === "paid") {
                        const bookingId = this.SnowFlake.generate();
                        await this.billingService.finalizeBookingFromCheckout(bookingId, session);
                    }
                    // Handle setup mode (adding payment method) - payment method is automatically attached to customer
                    // No action needed, Stripe handles it automatically
                    break;
                case "checkout.session.expired":
                    await this.billingService.expireDraftFromCheckout(session);
                    break;
                case "refund.created":
                    const refund = event.data.object as Stripe.Refund;

                    await this.billingService.handleRefundWebhook(refund)
                    break;
                default:
                    this.logger.info(`Unhandled Stripe event: ${event.type}`);
            }

            return res.json({ received: true });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('REQUEST_NOT_ALLOWED').send(res);
        }
    }

    public async updateBillingAddress(req: ValidatedRequest<BillingAddressData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const data: BillingAddressData = req.validatedBody!;

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            });

            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            // Update or create billing address in Stripe customer
            if (user.paymentCustomerId) {
                await StripeClient.customers.update(user.paymentCustomerId, {
                    address: {
                        line1: data.street,
                        city: data.city,
                        postal_code: data.postalCode,
                        country: data.country,
                        state: data.state || undefined,
                    }
                });
            }

            return res.json({
                code: 200,
                message: "Billing address updated successfully.",
                data: data
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async getBillingAddress(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            });

            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            if (!user.paymentCustomerId) {
                return res.status(404).json({
                    status: 404,
                    error: 'BILLING_ADDRESS_NOT_FOUND',
                    message: 'Billing address not found.'
                });
            }

            const customer = await StripeClient.customers.retrieve(user.paymentCustomerId);

            if (customer.deleted || !customer.address) {
                return res.status(404).json({
                    status: 404,
                    error: 'BILLING_ADDRESS_NOT_FOUND',
                    message: 'Billing address not found.'
                });
            }

            return res.json({
                code: 200,
                data: {
                    street: customer.address.line1 || "",
                    city: customer.address.city || "",
                    postalCode: customer.address.postal_code || "",
                    country: customer.address.country || "",
                    state: customer.address.state || "",
                }
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async setDefaultPaymentMethod(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const paymentMethodId = req.params.paymentMethodId;
            if (!paymentMethodId) return new this.ApiError("INCORRECT_BODY").send(res);

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            });

            if (!user || !user.paymentCustomerId) {
                return new this.ApiError('USER_NOT_FOUND').send(res);
            }

            // Verify payment method belongs to customer
            const paymentMethod = await StripeClient.paymentMethods.retrieve(paymentMethodId);
            if (paymentMethod.customer !== user.paymentCustomerId) {
                return new this.ApiError('REQUEST_NOT_ALLOWED').send(res);
            }

            // Set as default payment method
            await StripeClient.customers.update(user.paymentCustomerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId
                }
            });

            return res.json({
                code: 200,
                message: "Default payment method updated successfully."
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async deletePaymentMethod(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const paymentMethodId = req.params.paymentMethodId;
            if (!paymentMethodId) return new this.ApiError("INCORRECT_BODY").send(res);

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            });

            if (!user || !user.paymentCustomerId) {
                return new this.ApiError('USER_NOT_FOUND').send(res);
            }

            // Verify payment method belongs to customer
            const paymentMethod = await StripeClient.paymentMethods.retrieve(paymentMethodId);
            if (paymentMethod.customer !== user.paymentCustomerId) {
                return new this.ApiError('REQUEST_NOT_ALLOWED').send(res);
            }

            // Check if it's the default payment method - prevent deletion
            const customer = await StripeClient.customers.retrieve(user.paymentCustomerId);
            if (!customer.deleted && customer.invoice_settings?.default_payment_method === paymentMethodId) {
                return new this.ApiError('CANNOT_DELETE_DEFAULT_PAYMENT_METHOD').send(res);
            }

            // Detach payment method from customer
            await StripeClient.paymentMethods.detach(paymentMethodId);

            return res.json({
                code: 200,
                message: "Payment method deleted successfully."
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async createSetupIntent(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            });

            if (!user || !user.paymentCustomerId) {
                return new this.ApiError('USER_NOT_FOUND').send(res);
            }

            // Create setup intent for adding payment method
            const setupIntent = await StripeClient.setupIntents.create({
                customer: user.paymentCustomerId,
                payment_method_types: ["card"],
            });

            return res.json({
                code: 200,
                clientSecret: setupIntent.client_secret,
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async confirmSetupIntent(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const { setupIntentId } = req.body;

            if (!setupIntentId) {
                return new this.ApiError("INCORRECT_BODY").send(res);
            }

            const user = await this.userService.find({
                where: { id: userId },
                omit: { password: true }
            });

            if (!user || !user.paymentCustomerId) {
                return new this.ApiError('USER_NOT_FOUND').send(res);
            }

            // Retrieve and verify setup intent belongs to customer
            const setupIntent = await StripeClient.setupIntents.retrieve(setupIntentId);
            
            if (setupIntent.customer !== user.paymentCustomerId) {
                return new this.ApiError('REQUEST_NOT_ALLOWED').send(res);
            }

            // Verify that the setup intent has succeeded (already confirmed by Stripe Elements on frontend)
            if (setupIntent.status !== 'succeeded') {
                return new this.ApiError('UNKNOWN_ERROR').send(res);
            }

            // Payment method is already attached to customer by Stripe Elements
            // No need to confirm again, just verify it succeeded

            return res.json({
                code: 200,
                message: "Payment method added successfully.",
            });

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async getCompanyProfiles(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const profiles = await this.companyProfileService.findMany({
                where: { userId },
                orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            });

            return res.json({
                code: 200,
                data: profiles,
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async createCompanyProfile(req: ValidatedRequest<CreateCompanyProfileData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const data: CreateCompanyProfileData = req.validatedBody!;

            const conflict = await this.companyProfileService.findFirst({
                where: {
                  userId,
                  OR: [{ label: data.label }, { companyName: data.companyName }],
                },
              });

            if (conflict) return new this.ApiError("COMPANY_PROFILE_ALREADY_EXISTS").send(res);

            if (data.isDefault) {
                const profiles = await this.companyProfileService.findMany({ where: { userId } });
                await Promise.all(
                    profiles.map((p) =>
                        this.companyProfileService.update({
                            where: { id: p.id },
                            data: { isDefault: false },
                        })
                    )
                );
            }

            const profile = await this.companyProfileService.create({
                data: {
                    id: this.SnowFlake.generate(),
                    userId,
                    label: data.label,
                    companyName: data.companyName,
                    vatNumber: data.vatNumber ?? null,
                    street: data.street,
                    city: data.city,
                    postalCode: data.postalCode,
                    country: data.country,
                    state: data.state ?? null,
                    isDefault: data.isDefault ?? false,
                },
            });

            return res.json({
                code: 200,
                message: "Company profile created successfully.",
                data: profile,
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async updateCompanyProfile(req: ValidatedRequest<UpdateCompanyProfileData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const profileId = req.params.id;
            if (!profileId) return new this.ApiError("INCORRECT_BODY").send(res);

            const profile = await this.companyProfileService.findFirst({
                where: { id: profileId, userId },
            });
            if (!profile) return new this.ApiError("COMPANY_PROFILE_NOT_FOUND").send(res);

            const data: UpdateCompanyProfileData = req.validatedBody!;

            if (data.isDefault) {
                const profiles = await this.companyProfileService.findMany({ where: { userId } });
                await Promise.all(
                    profiles
                        .filter((p) => p.id !== profileId)
                        .map((p) =>
                            this.companyProfileService.update({
                                where: { id: p.id },
                                data: { isDefault: false },
                            })
                        )
                );
            }

            const updated = await this.companyProfileService.update({
                where: { id: profileId },
                data: {
                    label: data.label,
                    companyName: data.companyName,
                    vatNumber: data.vatNumber ?? null,
                    street: data.street,
                    city: data.city,
                    postalCode: data.postalCode,
                    country: data.country,
                    state: data.state ?? null,
                    isDefault: data.isDefault ?? profile.isDefault,
                },
            });

            return res.json({
                code: 200,
                message: "Company profile updated successfully.",
                data: updated,
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async deleteCompanyProfile(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NOT_AUTHENTICATED").send(res);

            const profileId = req.params.id;
            if (!profileId) return new this.ApiError("INCORRECT_BODY").send(res);

            const profile = await this.companyProfileService.findFirst({
                where: { id: profileId, userId },
            });
            if (!profile) return new this.ApiError("COMPANY_PROFILE_NOT_FOUND").send(res);

            await this.companyProfileService.delete({ where: { id: profileId } });

            return res.json({
                code: 200,
                message: "Company profile deleted successfully.",
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }
}