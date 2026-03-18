import { hashSync, genSaltSync, compareSync } from 'bcrypt';
import Service from "./Service";

import config from "@/config";
import Stripe from "stripe";
import { StripeClient } from "@/utils/stripe";
import { Request } from "express";
import BookService from "./BookService";
import SlackService from "./SlackService";
import { formatBookingDateTime } from "@/utils/date";
import { BookingStatus, DispatchStatus, DraftStatus, DriverStatus } from "@prisma/client";
import { sendNewRideForDispatchEmail } from "@/emails";

export default class BillingService extends Service {
    private bookService: BookService = new BookService();
    private slackService: SlackService = new SlackService();

    public hash(data: string | Buffer): string {
        return hashSync(data, genSaltSync(10));
    }

    public async getBookingIdByPaymentSessionId(paymentSessionId: string): Promise<string | null> {
        const booking = await this.prisma.booking.findFirst({
            where: { paymentSessionId },
            select: { id: true },
        });
        return booking?.id ?? null;
    }

    public verifyWebhook(req: Request): Stripe.Event {
        const signature = req.headers["stripe-signature"] as string;

        if (!signature) {
            throw new Error("Missing Stripe signature");
        }

        return StripeClient.webhooks.constructEvent(
            req.body,
            signature,
            config.stripe.webhookSecret!
        );
    }

    public async finalizeBookingFromCheckout(
        bookingId: string,
        session: Stripe.Checkout.Session
    ): Promise<void> {
        const draftId = session.metadata?.draftId;

        if (!draftId) throw new Error("Missing draftId in checkout session metadata");

        if (session.payment_status !== "paid") return;

        const draft = await this.bookService.fetchDraft({ where: { id: draftId } })
        if (!draft) throw new Error("BookingDraft not found");

        if (draft.status === DraftStatus.PAID) return;

        if (draft.paymentSessionId !== session.id) throw new Error("Checkout session mismatch");

        const totalPaidCents = session.amount_total ?? 0;

        // Platform commissie (bijv. 15%)
        const commissionPlatformCents = Math.round(totalPaidCents * 0.15);
        const totalPaid = totalPaidCents / 100;
        const commissionPlatform = commissionPlatformCents / 100;

        // Driver payout = totaal minus platform commissie
        const driverPayout = parseFloat((totalPaid - commissionPlatform).toFixed(2));

        // Driver payout = totaal minus platform en partner commissie

        let companyName: string | null = null;
        let vatNumber: string | null = null;
        let billingAddress: string | null = null;
        if (draft.companyProfileId) {
            const profile = await this.prisma.companyProfile.findFirst({
                where: { id: draft.companyProfileId },
                select: { companyName: true, vatNumber: true, street: true, city: true, postalCode: true, country: true, state: true },
            });
            if (profile) {
                companyName = profile.companyName;
                vatNumber = profile.vatNumber;
                const parts = [profile.street, profile.postalCode && profile.city ? `${profile.postalCode} ${profile.city}` : profile.city, profile.state, profile.country].filter(Boolean);
                billingAddress = parts.join(", ");
            }
        }

        await this.transaction(async (tx) => {

            await tx.booking.create({
                data: {
                    id: bookingId,
                    userId: draft.userId!,

                    startAddress: draft.startAddress,
                    startLat: draft.startLat,
                    startLng: draft.startLng,
                    endAddress: draft.endAddress,
                    endLat: draft.endLat,
                    endLng: draft.endLng,
                    distanceMeters: draft.distanceMeters,
                    durationSeconds: draft.durationSeconds,

                    notes: draft.notes,
                    flightNumber: draft.flightNumber,

                    bookingType: draft.bookingType ?? "personal",
                    companyName,
                    vatNumber,
                    billingAddress,

                    bookingTime: draft.bookingTime,
                    status: BookingStatus.CONFIRMED,
                    dispatchStatus: DispatchStatus.NO_DRIVER,

                    carTypeId: draft.carTypeId!,

                    price: totalPaid,
                    commissionPlatform: commissionPlatform,
                    driverPayout: driverPayout,

                    paymentIntentId: session.payment_intent as string,
                    paymentSessionId: session.id,
                }
            })

            await tx.bookingDraft.update({
                where: { id: draft.id },
                data: { status: DraftStatus.PAID },
            });
        });

        await this.notifyAdminNewBooking(bookingId);
    }

    /**
     * Notify admin of new booking: send Slack webhook first; only if that fails, send email.
     */
    private async notifyAdminNewBooking(bookingId: string): Promise<void> {
        try {
            const booking = await this.prisma.booking.findFirst({
                where: { id: bookingId },
                select: {
                    id: true,
                    startAddress: true,
                    endAddress: true,
                    bookingTime: true,
                    notes: true,
                    flightNumber: true,
                    CarType: { select: { name: true } },
                    user: {
                        select: { firstname: true, lastname: true, phone: true },
                    },
                },
            });
            if (!booking) return;

            const dispatchBookingUrl = `${config.dispatchAppUrl.replace(/\/$/, "")}/bookings/${bookingId}`;
            const bookingTimeFormatted = formatBookingDateTime(booking.bookingTime);
            const passengerName = [booking.user.firstname, booking.user.lastname].filter(Boolean).join(" ") || "—";
            const notesDisplay = booking.notes?.trim() || "N/A";
            const flightNumberDisplay = booking.flightNumber?.trim() || "N/A";

            const slackPayload = {
                bookingId: booking.id,
                passengerName,
                phone: booking.user.phone,
                startAddress: booking.startAddress,
                endAddress: booking.endAddress,
                bookingTimeFormatted,
                notesDisplay,
                flightNumberDisplay,
                carTypeName: booking.CarType?.name ?? "—",
                dispatchBookingUrl,
            };

            const webhookSent = await this.slackService.sendNewBookingForDispatch(slackPayload);
            if (webhookSent) return;

            const adminEmails = config.adminEmail?.split(",").map((e) => e.trim()).filter(Boolean);
            if (!adminEmails?.length) return;

            const emailPayload = {
                bookingId: booking.id,
                startAddress: booking.startAddress,
                endAddress: booking.endAddress,
                bookingTimeFormatted,
                carTypeName: booking.CarType?.name ?? "—",
                dispatchBookingUrl,
            };
            
            if(config.app.isProduction) {
                sendNewRideForDispatchEmail(adminEmails, emailPayload).catch((err) => {
                    console.error("New booking dispatch email failed", err);
                });
            }
        } catch (err) {
            console.error("Failed to notify admin of new booking", err);
        }
    }

    public async expireDraftFromCheckout(
        session: Stripe.Checkout.Session
    ): Promise<boolean> {
        console.log("EXPIRED.SESSION", session.metadata, session.id)
        const draftId = session.metadata?.draftId;

        if (!draftId) return false;

        if (session.payment_status === "paid") return false;

        const draft = await this.bookService.fetchDraft({
            where: { id: draftId }
        });

        if (!draft) return false;

        if (draft.status === DraftStatus.PAID || draft.status === DraftStatus.EXPIRED) return false;

        if (draft.paymentSessionId !== session.id) return false;

        const updated = await this.bookService.updateDraft({
            where: { id: draft.id },
            data: { status: DraftStatus.EXPIRED },
        });

        return !!updated;
    }

    public async handleRefundWebhook(refund: Stripe.Refund) {
        if (!refund.payment_intent) return;

        await this.prisma.booking.updateMany({
            where: {
                paymentIntentId: refund.payment_intent as string,
                refundId: null
            },
            data: {
                refundId: refund.id,
                refundedAt: new Date(refund.created * 1000)
            }
        });
    }

    public async refundPayment(
        paymentIntentId: string,
        bookingId: string,
    ) {
        const refund = StripeClient.refunds.create({
            payment_intent: paymentIntentId,
            metadata: {
                bookingId
            }
        })

        return refund;
    }

    public async getPaymentInfo(paymentIntentId: string) {
        const pi = await StripeClient.paymentIntents.retrieve(
            paymentIntentId,
            { expand: ["latest_charge"] }
        );

        const charge = pi.latest_charge as Stripe.Charge | null;
        const details = charge?.payment_method_details;

        // Map all relevant info for frontend
        const method = this.mapPaymentMethod(details);

        return {
            method,
            last4: details?.card?.last4 ?? null,
            expiry: details?.card ? `${details.card.exp_month}/${details.card.exp_year}` : null
        };
    }

    private mapPaymentMethod(
        details?: Stripe.Charge.PaymentMethodDetails | null,
        charge?: Stripe.Charge | null
    ) {
        if (!details) return { type: "unknown", label: "Payment", card: undefined };

        // Credit/debit cards
        if (details.card) {
            let type: string | null = details ? details.card.brand : "card";
            let label: string = this.mapCardBrand(details.card.brand);

            // Safely get wallet type (Apple/Google Pay)
            const paymentMethod = charge?.payment_method as Stripe.PaymentMethod | string | undefined;
            let walletType: string | undefined;
            if (typeof paymentMethod !== "string" && paymentMethod?.card?.wallet) {
                walletType = paymentMethod.card.wallet.type;
            }

            if (walletType === "apple_pay") type = "applepay";
            else if (walletType === "google_pay") type = "androidpay";

            return { type, label, card: true };
        }

        // iDEAL
        if (details.ideal) return { type: "ideal", label: "iDEAL", card: false };

        // PayPal
        if (details.paypal) return { type: "paypal", label: "PayPal", card: false };

        // Revolut Pay
        if (details.revolut_pay) return { type: "revolut_pay", label: "Revolut", card: false };

        // Fallback
        return { type: "other", label: "Payment", card: undefined };
    }


    private mapCardBrand(brand?: string | null) {
        switch (brand) {
            case "visa":
                return "Visa";
            case "mastercard":
                return "Mastercard";
            case "amex":
                return "American Express";
            default:
                return "Card";
        }
    }



}