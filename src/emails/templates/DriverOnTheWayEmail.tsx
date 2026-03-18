import * as React from "react";
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import { emailTheme } from "../theme";

export interface DriverOnTheWayEmailProps {
    trackUrl: string;
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
    margin: "0 0 28px 0",
};

const buttonStyle: React.CSSProperties = {
    backgroundColor: emailTheme.primary,
    color: emailTheme.primaryForeground,
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    padding: "14px 28px",
    borderRadius: "10px",
    display: "inline-block",
};

const mutedStyle: React.CSSProperties = {
    fontSize: "14px",
    color: emailTheme.muted,
    lineHeight: 1.5,
    margin: 0,
};

export default function DriverOnTheWayEmail({ trackUrl }: DriverOnTheWayEmailProps) {
    const previewText = "Your driver is on the way – track your ride live.";

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={bodyStyle}>
                <Container style={containerStyle}>
                    <Heading style={headingStyle}>
                        Your driver is on the way
                    </Heading>
                    <Text style={textStyle}>
                        Your driver is heading to the pickup point. Track your ride live using the link below.
                    </Text>
                    <Section style={{ textAlign: "center" as const, marginBottom: "28px" }}>
                        <Button href={trackUrl} style={buttonStyle}>
                            Track your ride
                        </Button>
                    </Section>
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
