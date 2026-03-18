export const config = {
    app: {
        name: process.env.APP_NAME || "ReadytooPickup-backend",
        env: process.env.APP_ENV || "development",
        url: process.env.APP_URL || "http://localhost:5173",
        port: Number(process.env.APP_PORT) || 4000,
    },
    jwt: {
        secret: process.env.JWT_SECRET as string,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN as string | number) || "24h",
        issuer: process.env.JWT_ISSUER || "readytoopickup-api",
        audience: process.env.JWT_AUDIENCE || "readytoopickup-frontend",
        refresh: {
            expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN as string | number) || "7d",
        }
    },
    stripe: {
        secret: process.env.STRIPE_SECRET as string,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
    }
};