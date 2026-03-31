import type { StringValue } from "ms";

import dotenv from "dotenv";
dotenv.config();

export default {
    app: {
        name: process.env.APP_NAME || "ReadytooPickup-backend",
        environment: process.env.APP_ENV === 'production' ? 'production' : 'development',
        isProduction: process.env.APP_ENV === 'production',
        url: process.env.APP_URL || "http://localhost:5173",
        port: Number(process.env.APP_PORT) || 4000,
        allowedOrigins: (process.env.APP_URLS || "http://localhost:5173").split(",")
    },
    jwt: {
        secret: process.env.JWT_SECRET as string,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN ?? "24h") as StringValue,
        issuer: process.env.JWT_ISSUER || "readytoopickup-api",
        audience: process.env.JWT_AUDIENCE || "readytoopickup-frontend",
        refresh: {
            expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN ?? "24h") as StringValue,
        }
    },
    stripe: {
        secret: process.env.STRIPE_SECRET as string,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
    },
    service_area: {
        lat: Number(process.env.SERVICE_AREA_LAT),
        lng: Number(process.env.SERVICE_AREA_LNG),
        radiusKm: Number(process.env.SERVICE_AREA_RADIUS_KM)
    },
    resend: {
        apiKey: process.env.RESEND_API_KEY as string,
        fromEmail: process.env.RESEND_FROM_EMAIL || "Ready2Pickup <noreply@notifications.r2ptaxi.com>",
    },
    /** Admin email for new-ride notifications; comma-separated for multiple. If empty, no email is sent. */
    adminEmail: (process.env.ADMIN_EMAIL || "").trim() || undefined,
    /** Base URL of the dispatch panel (for links in admin emails). Falls back to app.url if not set. */
    dispatchAppUrl: process.env.DISPATCH_APP_URL || "http://localhost:3000 ",
    /** Slack webhook URL for new-ride notifications. If set, Slack is tried first; email is used as fallback on failure. */
    slackWebhookUrl: (process.env.SLACK_WEBHOOK_URL || "").trim() || undefined,
    /** Booking: minimale uren in de toekomst voor pickup-tijd (env: MIN_BOOKING_HOURS_AHEAD, default 1). */
    booking: {
        minHoursAhead: Math.max(0, Number(process.env.MIN_BOOKING_HOURS_AHEAD) || 1),
    },
    /** Geo dispatch tuning: shared H3 settings for driver location + nearest-driver lookup. */
    geo: {
        /** H3 resolution used when storing driver location cells. Must match nearest lookup. */
        h3Resolution: Math.min(12, Math.max(0, Number(process.env.H3_RESOLUTION) || 9)),
        /** Max H3 ring distance for nearest-driver shortlist around pickup. */
        nearestMaxRing: Math.min(20, Math.max(1, Number(process.env.NEAREST_MAX_RING) || 6)),
    },
    /** Invoice PDF: company details (rechtsboven op factuur). Optioneel via env. */
    invoice: {
        companyName: process.env.INVOICE_COMPANY_NAME || "Ready2Pickup",
        address: process.env.INVOICE_COMPANY_ADDRESS || "Langswater 684, 1069EG Amsterdam",
        email: process.env.INVOICE_COMPANY_EMAIL || "info@ready2pickup.nl",
        phone: process.env.INVOICE_COMPANY_PHONE || "000-0000000",
        kvk: process.env.INVOICE_KVK || "92790291",
        btw: process.env.INVOICE_BTW || "NL004976549B09",
        bankIban: process.env.INVOICE_BANK_IBAN || "NL00 BANK 0000 0000 00",
        bankBic: process.env.INVOICE_BANK_BIC || "BANKNL2A",
    },
    /** Rate limiting: store in memory (default) or set REDIS_URL for shared store across instances. */
    rateLimit: {
        /** Global: max requests per window per IP (env: RATE_LIMIT_GLOBAL_LIMIT, default 150). */
        globalLimit: Math.max(10, Number(process.env.RATE_LIMIT_GLOBAL_LIMIT) || 150),
        /** Global: window in ms (env: RATE_LIMIT_GLOBAL_WINDOW_MS, default 1 minute). */
        globalWindowMs: Math.max(60_000, Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS) || 60_000),
        /** Auth (login/register/otp): max attempts per window per key (env: RATE_LIMIT_AUTH_LIMIT, default 10). */
        authLimit: Math.max(3, Number(process.env.RATE_LIMIT_AUTH_LIMIT) || 10),
        /** Auth: window in ms (env: RATE_LIMIT_AUTH_WINDOW_MS, default 10 minutes). */
        authWindowMs: Math.max(60_000, Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 10 * 60 * 1000),
        /** Login: max failed attempts per window (env: RATE_LIMIT_LOGIN_LIMIT, default 5). */
        loginLimit: Math.max(3, Number(process.env.RATE_LIMIT_LOGIN_LIMIT) || 5),
        /** Redis URL for shared rate limit store (optional). If set, use rate-limit-redis in store factory. */
        redisUrl: (process.env.REDIS_URL || "").trim() || undefined,
    },
}