import React from "react";
import { render } from "@react-email/render";
import EmailService from "@/services/EmailService";
import NewRideForDispatchEmail from "./templates/NewRideForDispatchEmail";

const SUBJECT = "New ride to assign – Ready2Pickup";

export interface NewRideForDispatchOptions {
    bookingId: string;
    startAddress: string;
    endAddress: string;
    bookingTimeFormatted: string;
    carTypeName: string;
    dispatchBookingUrl: string;
}

/**
 * Sends the "new ride for dispatch" email to admin(s). Call after a booking is finalized from checkout.
 */
export async function sendNewRideForDispatchEmail(
    to: string | string[],
    options: NewRideForDispatchOptions
): Promise<{ id?: string; error?: string }> {
    const html = await render(
        React.createElement(NewRideForDispatchEmail, {
            bookingId: options.bookingId,
            startAddress: options.startAddress,
            endAddress: options.endAddress,
            bookingTimeFormatted: options.bookingTimeFormatted,
            carTypeName: options.carTypeName,
            dispatchBookingUrl: options.dispatchBookingUrl,
        })
    );
    const text = [
        "New ride to assign",
        "",
        "A new ride has been booked and is waiting to be assigned in the dispatch panel.",
        "",
        `From: ${options.startAddress}`,
        `To: ${options.endAddress}`,
        `Date & time: ${options.bookingTimeFormatted}`,
        `Car type: ${options.carTypeName}`,
        `Booking ID: ${options.bookingId}`,
        "",
        `Open in dispatch panel: ${options.dispatchBookingUrl}`,
    ].join("\n");

    const emailService = new EmailService();
    return emailService.send({ to, subject: SUBJECT, html, text });
}
