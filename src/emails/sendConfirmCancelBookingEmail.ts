import React from "react";
import { render } from "@react-email/render";
import EmailService from "@/services/EmailService";
import ConfirmCancelBookingEmail from "./templates/ConfirmCancelBookingEmail";

const SUBJECT = "Booking canceled";

export interface ConfirmCancelBookingOptions {
    isLate: boolean;
    bookingTime: Date | string;
    amountCharged?: string;
}

function formatBookingTime(bookingTime: Date | string): string {
    const d = typeof bookingTime === "string" ? new Date(bookingTime) : bookingTime;
    return d.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

/**
 * Sends the cancel booking confirmation email. Call after a booking is canceled.
 * isLate: true = cancelled within 1 hour → 100% charged; false = cancelled in time → free.
 */
export async function sendConfirmCancelBookingEmail(
    to: string,
    options: ConfirmCancelBookingOptions
): Promise<{ id?: string; error?: string }> {
    const bookingTimeFormatted = formatBookingTime(options.bookingTime);
    const html = await render(
        React.createElement(ConfirmCancelBookingEmail, {
            isLate: options.isLate,
            bookingTimeFormatted,
            amountCharged: options.amountCharged,
        })
    );
    const text = [
        "Booking canceled",
        "",
        `Your booking scheduled for ${bookingTimeFormatted} has been canceled.`,
        options.isLate
            ? "Because the cancellation was within 1 hour of the pickup time, the full amount has been charged. We plan ahead to reserve capacity for you."
            : "You canceled more than 1 hour before the booking. No charges apply. If a payment was already made, a refund will be processed.",
        options.amountCharged && options.isLate ? `Amount charged: ${options.amountCharged}` : "",
        "",
        "Best regards,",
        "Ready2Pickup",
    ]
        .filter(Boolean)
        .join("\n");

    const emailService = new EmailService();
    return emailService.send({ to, subject: SUBJECT, html, text });
}
