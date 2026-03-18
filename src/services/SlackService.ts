import axios, { AxiosError } from "axios";
import config from "@/config";

export interface NewBookingForDispatchSlackOptions {
    bookingId: string;
    passengerName: string;
    phone: string;
    startAddress: string;
    endAddress: string;
    bookingTimeFormatted: string;
    notesDisplay: string;
    flightNumberDisplay: string;
    carTypeName: string;
    dispatchBookingUrl: string;
}

export interface CancelBookingSlackOptions {
    bookingId: string;
    passengerName: string;
    phone: string;
    startAddress: string;
    endAddress: string;
    bookingTimeFormatted: string;
    notesDisplay: string;
    flightNumberDisplay: string;
    carTypeName: string;
    dispatchBookingUrl: string;
}

/**
 * SlackService – sends notifications to a Slack channel via Incoming Webhook.
 * Uses SLACK_WEBHOOK_URL from config. Does not throw when webhook is missing.
 */
export default class SlackService {
    private webhookUrl: string | undefined;

    constructor() {
        this.webhookUrl = config.slackWebhookUrl;
    }

    /**
     * Send a "new booking for dispatch" message to Slack (Block Kit).
     * @returns true if sent, false if webhook missing or request failed.
     */
    async sendNewBookingForDispatch(options: NewBookingForDispatchSlackOptions): Promise<boolean> {
        if (!this.webhookUrl) {
            return false;
        }

        const payload = {
            text: `New Booking – ${options.passengerName} (#${options.bookingId})`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: `🚕 New Booking – ${options.passengerName} (#${options.bookingId})`,
                        emoji: true,
                    },
                },
                {
                    type: "section",
                    fields: [
                        { type: "mrkdwn", text: `*Passenger:*\n${options.passengerName}` },
                        { type: "mrkdwn", text: `*Phone:*\n${options.phone}` },
                        { type: "mrkdwn", text: `*Pickup:*\n${options.startAddress}` },
                        { type: "mrkdwn", text: `*Dropoff:*\n${options.endAddress}` },
                        { type: "mrkdwn", text: `*Time:*\n${options.bookingTimeFormatted}` },
                        { type: "mrkdwn", text: `*Car type:*\n${options.carTypeName}` },
                        { type: "mrkdwn", text: `*Notes:*\n${options.notesDisplay}` },
                        { type: "mrkdwn", text: `*Flight number:*\n${options.flightNumberDisplay}` },
                    ],
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*View booking details:*"
                    },
                    accessory: {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Open Booking",
                            emoji: false,
                        },
                        url: options.dispatchBookingUrl,
                    },
                },
            ],
        };

        try {
            await axios.post(this.webhookUrl, payload, {
                headers: { "Content-Type": "application/json" },
                timeout: 10_000,
            });
            return true;
        } catch (err) {
            const axiosErr = err as AxiosError;
            if (axiosErr.response) {
                console.warn("Slack webhook non-OK", axiosErr.response.status, axiosErr.response.data);
            } else {
                console.error("Slack webhook request failed", axiosErr.message);
            }
            return false;
        }
    }

    async sendCancelledBookingForDispatch(options: CancelBookingSlackOptions): Promise<boolean> {
        if (!this.webhookUrl) {
            return false;
        }

        const payload = {
            text: `Booking cancelled – ${options.passengerName} (${options.bookingId})`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: `❌ Booking cancelled – ${options.passengerName} (${options.bookingId})`,
                        emoji: true
                    }
                },
                {
                    type: "section",
                    fields: [
                        { type: "mrkdwn", text: `*Passenger:*\n${options.passengerName}` },
                        { type: "mrkdwn", text: `*Phone:*\n${options.phone}` },
                        { type: "mrkdwn", text: `*Pickup:*\n${options.startAddress}` },
                        { type: "mrkdwn", text: `*Dropoff:*\n${options.endAddress}` },
                        { type: "mrkdwn", text: `*Time:*\n${options.bookingTimeFormatted}` },
                        { type: "mrkdwn", text: `*Car type:*\n${options.carTypeName}` },
                        { type: "mrkdwn", text: `*Notes:*\n${options.notesDisplay}` },
                        { type: "mrkdwn", text: `*Flight number:*\n${options.flightNumberDisplay}` },
                    ],
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*View booking details:*"
                    },
                    accessory: {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Open Booking",
                            emoji: false
                        },
                        url: options.dispatchBookingUrl
                    }
                }
            ]
        };

        try {
            await axios.post(this.webhookUrl, payload, {
                headers: { "Content-Type": "application/json" },
                timeout: 10_000,
            });
            return true;
        } catch (err) {
            const axiosErr = err as AxiosError;
            if (axiosErr.response) {
                console.warn("Slack webhook non-OK", axiosErr.response.status, axiosErr.response.data);
            } else {
                console.error("Slack webhook request failed", axiosErr.message);
            }
            return false;
        }
    }
}
