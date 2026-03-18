import * as React from "react";
import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import { emailTheme } from "../theme";

export interface ConfirmCancelBookingEmailProps {
    /** Cancelled more than 1 hour before → free. Within 1 hour → 100% charged. */
    isLate: boolean;
    /** Original booking time for reference */
    bookingTimeFormatted: string;
    /** Amount charged (only when isLate). e.g. "€ 45.00" */
    amountCharged?: string;
}

const bodyStyle: React.CSSProperties = {
    backgroundColor: emailTheme.background,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "24px 16px",
    margin: "0 auto",
};

const containerStyle: React.CSSProperties = {
    maxWidth: "520px",
    margin: "0 auto",
    backgroundColor: emailTheme.card,
    borderRadius: "12px",
    padding: "40px 32px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const headingStyle: React.CSSProperties = {
    fontSize: "24px",
    fontWeight: 700,
    color: emailTheme.foreground,
    margin: "0 0 16px 0",
};

const textStyle: React.CSSProperties = {
    fontSize: "15px",
    lineHeight: 1.6,
    color: emailTheme.body,
    margin: "0 0 12px 0",
};

const mutedStyle: React.CSSProperties = {
    fontSize: "14px",
    color: emailTheme.muted,
    lineHeight: 1.5,
    margin: 0,
};

export default function ConfirmCancelBookingEmail({
    isLate,
    bookingTimeFormatted,
    amountCharged,
}: ConfirmCancelBookingEmailProps) {
    const previewText = "Your booking has been canceled.";

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={bodyStyle}>
                <Container style={containerStyle}>
                    <Heading style={headingStyle}>
                        Booking canceled
                    </Heading>
                    <Text style={textStyle}>
                        Your booking scheduled for <strong>{bookingTimeFormatted}</strong> has been canceled.
                    </Text>
                    {isLate ? (
                        <>
                            <Text style={textStyle}>
                                Because the cancellation was within 1 hour of the pickup time, the full amount has been charged. We plan ahead to reserve capacity for you.
                            </Text>
                            {amountCharged && (
                                <Text style={{ ...textStyle, marginBottom: "28px" }}>
                                    Amount charged: <strong>{amountCharged}</strong>
                                </Text>
                            )}
                        </>
                    ) : (
                        <Text style={{ ...textStyle, marginBottom: "28px" }}>
                            You canceled more than 1 hour before the booking. No charges apply. If a payment was already made, a refund will be processed.
                        </Text>
                    )}
                    <Text style={mutedStyle}>
                        Best regards,
                        <br />
                        Ready2Pickup
                    </Text>
                </Container>
            </Body>
        </Html>
    );
}
