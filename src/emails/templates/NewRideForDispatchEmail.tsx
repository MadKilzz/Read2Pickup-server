import * as React from "react";
import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import { emailTheme } from "../theme";

export interface NewRideForDispatchEmailProps {
    bookingId: string;
    startAddress: string;
    endAddress: string;
    bookingTimeFormatted: string;
    carTypeName: string;
    dispatchBookingUrl: string;
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

const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: emailTheme.muted,
    marginBottom: "4px",
};

const linkStyle: React.CSSProperties = {
    color: emailTheme.primary,
    fontWeight: 600,
};

export default function NewRideForDispatchEmail({
    bookingId,
    startAddress,
    endAddress,
    bookingTimeFormatted,
    carTypeName,
    dispatchBookingUrl,
}: NewRideForDispatchEmailProps) {
    const previewText = "New ride to assign in the dispatch panel.";

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={bodyStyle}>
                <Container style={containerStyle}>
                    <Heading style={headingStyle}>New ride to dispatch</Heading>
                    <Text style={textStyle}>
                        A new ride has been booked and is waiting to be assigned in the dispatch panel.
                    </Text>
                    <Section style={{ marginTop: "20px", marginBottom: "20px" }}>
                        <p style={labelStyle}>From</p>
                        <p style={textStyle}>{startAddress}</p>
                        <p style={labelStyle}>To</p>
                        <p style={textStyle}>{endAddress}</p>
                        <p style={labelStyle}>Date & time</p>
                        <p style={textStyle}>{bookingTimeFormatted}</p>
                        <p style={labelStyle}>Car type</p>
                        <p style={textStyle}>{carTypeName}</p>
                        <p style={labelStyle}>Booking ID</p>
                        <p style={{ ...textStyle, fontFamily: "monospace" }}>{bookingId}</p>
                    </Section>
                    <Text style={textStyle}>
                        <Link href={dispatchBookingUrl} style={linkStyle}>
                            Open in dispatch panel →
                        </Link>
                    </Text>
                </Container>
            </Body>
        </Html>
    );
}
