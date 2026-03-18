import React from "react";
import { render } from "@react-email/render";
import EmailService from "@/services/EmailService";
import DriverOnTheWayEmail from "./templates/DriverOnTheWayEmail";

const SUBJECT = "Your driver is on the way";

/**
 * Renders and sends the "driver on the way" email. Use when dispatch status becomes ON_THE_WAY.
 * Returns Resend result; log result.error on failure.
 */
export async function sendDriverOnTheWayEmail(
    to: string,
    trackUrl: string
): Promise<{ id?: string; error?: string }> {
    const html = await render(React.createElement(DriverOnTheWayEmail, { trackUrl }));
    const text = `Your driver is on the way\n\nTrack your ride live: ${trackUrl}\n\nBest regards,\nReady2Pickup`;
    const emailService = new EmailService();
    return emailService.send({ to, subject: SUBJECT, html, text });
}
