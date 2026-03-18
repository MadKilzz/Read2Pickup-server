import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { safeVerify, tryRefresh } from "@/middelware/auth";
import TrackService from "@/services/TrackService";
import config from "@/config";

const TRACKING_ROOM_PREFIX = "tracking:";

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) return {};
    return Object.fromEntries(
        cookieHeader
            .split(";")
            .map((s) => s.trim().split("="))
            .filter(([_, v]) => v != null)
            .map(([k, v]) => [k, decodeURIComponent(v ?? "")])
    );
}

let io: Server | null = null;

export function getIO(): Server | null {
    return io;
}

export function initSocket(httpServer: HttpServer): Server {
    io = new Server(httpServer, {
        path: "/events",
        cors: {
            origin: (origin, callback) => {
                if (origin && config.app.allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }

                if (!origin) return callback(null, true);

                return callback(null, false);
            },
            methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            allowedHeaders: ["Content-Type", "Authorization", "X-App-Info"],
            credentials: true,
        },
    });

    const trackService = new TrackService();

    io.on("connection", (socket) => {
        socket.on("subscribe", async (payload: { bookingId: string; token?: string }) => {
            const bookingId = payload?.bookingId;
            const cookies = parseCookies(socket.handshake.headers.cookie as string | undefined);
            const accessToken =
                payload?.token ??
                (socket.handshake.auth?.token as string | undefined) ??
                (socket.handshake.query?.token as string | undefined) ??
                cookies.R2P_access;
            const refreshToken = cookies.R2P_refresh;

            if (!bookingId || typeof bookingId !== "string") {
                socket.emit("error", { message: "bookingId required" });
                return;
            }

            if (!accessToken && !refreshToken) {
                socket.emit("error", { message: "Unauthorized" });
                return;
            }

            try {
                let payloadRes = await safeVerify(accessToken);
                let accessTokenToUse = accessToken;

                if (!payloadRes && refreshToken) {
                    const refreshed = await tryRefresh(refreshToken);
                    if (refreshed) {
                        payloadRes = refreshed.payload;
                        accessTokenToUse = refreshed.accessToken;
                        socket.emit("token_refreshed", { accessToken: refreshed.accessToken });
                    }
                }

                const userId = payloadRes?.id as string | undefined;
                if (!userId) {
                    socket.emit("error", { message: "Unauthorized" });
                    return;
                }

                const info = await trackService.getTrackingInfo(bookingId, userId);
                if (!info) {
                    socket.emit("error", { message: "Booking not found or not available for tracking" });
                    return;
                }

                const room = TRACKING_ROOM_PREFIX + bookingId;
                await socket.join(room);
                socket.emit("subscribed", { bookingId });
            } catch {
                socket.emit("error", { message: "Unauthorized" });
            }
        });
    });

    return io;
}

export type DriverLocationPayload = {
    lat: number;
    lng: number;
    timestamp: number;
};

export function emitDriverLocation(bookingId: string, payload: DriverLocationPayload): void {
    if (!io) return;
    const room = TRACKING_ROOM_PREFIX + bookingId;
    io.to(room).emit("driver:location", payload);
}

export type TrackingEventPayload = {
    eventType: string;
    timestamp: string;
    latitude?: number;
    longitude?: number;
};

export function emitTrackingEvent(bookingId: string, payload: TrackingEventPayload): void {
    if (!io) return;
    const room = TRACKING_ROOM_PREFIX + bookingId;
    io.to(room).emit("tracking:event", payload);
}
