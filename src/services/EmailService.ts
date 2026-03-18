import { Resend } from "resend";
import config from "@/config";

export interface SendEmailOptions {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    from?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
}

/**
 * EmailService – verzendt e-mails via Resend API.
 * Gebruikt RESEND_API_KEY en RESEND_FROM_EMAIL uit config.
 */
export default class EmailService {
    private resend: Resend;

    constructor() {
        const apiKey = config.resend?.apiKey;
        if (!apiKey) {
            throw new Error("RESEND_API_KEY is not set in environment");
        }
        this.resend = new Resend(apiKey);
    }

    /**
     * Verstuur een e-mail via Resend.
     * Minimaal één van html of text is verplicht.
     */
    async send(options: SendEmailOptions): Promise<{ id?: string; error?: string }> {
        const from = options.from ?? config.resend?.fromEmail ?? "onboarding@resend.dev";
        const to = Array.isArray(options.to) ? options.to : [options.to];

        if (!options.html && !options.text) {
            return { error: "Either html or text content is required" };
        }

        const payload = {
            from,
            to,
            subject: options.subject,
            ...(options.html ? { html: options.html } : { text: options.text! }),
            ...(options.replyTo && { replyTo: options.replyTo }),
            ...(options.cc && { cc: options.cc }),
            ...(options.bcc && { bcc: options.bcc }),
        };

        const { data, error } = await this.resend.emails.send(payload);

        if (error) {
            return { error: error.message };
        }
        return { id: data?.id };
    }
}
