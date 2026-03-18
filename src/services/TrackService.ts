import { DispatchStatus } from "@prisma/client";
import Service from "./Service";
import RouteCacheService from "./RouteCacheService";

/** Only allow tracking when driver is on the way or has arrived (not yet started ride or completed). */
const TRACKABLE_STATUSES: DispatchStatus[] = [
    DispatchStatus.ON_THE_WAY,
    DispatchStatus.ARRIVED,
];

export type TrackingEvent = {
    eventType: string;
    timestamp: string;
};

export type TrackInfo = {
    id: string;
    dispatchStatus: string;
    startAddress: string;
    endAddress: string;
    pickupLocation: { lat: number; lng: number };
    bookingTime: string;
    driver?: { firstname: string; lastname: string; phone: string };
    driverLocation?: { lat: number; lng: number } | null;
    trackingEvents: TrackingEvent[];
};

export default class TrackService extends Service {
    private routeCacheService: RouteCacheService = new RouteCacheService();

    public async getTrackingInfo(bookingId: string, userId: string): Promise<TrackInfo | null> {
        const booking = await this.prisma.booking.findFirst({
            where: {
                id: bookingId,
                userId,
                dispatchStatus: { in: TRACKABLE_STATUSES },
            },
            select: {
                id: true,
                dispatchStatus: true,
                startAddress: true,
                startLat: true,
                startLng: true,
                endAddress: true,
                bookingTime: true,
                driver: {
                    select: {
                        user: { select: { firstname: true, lastname: true, phone: true } },
                        locationLat: true,
                        locationLng: true,
                    },
                },
                bookingTrackingEvents: {
                    orderBy: { timestamp: "asc" },
                    select: { eventType: true, timestamp: true },
                },
            },
        });
        if (!booking) return null;
        const driver = booking.driver;
        return {
            id: booking.id,
            dispatchStatus: booking.dispatchStatus,
            startAddress: booking.startAddress,
            endAddress: booking.endAddress,
            pickupLocation: { lat: booking.startLat, lng: booking.startLng },
            bookingTime: booking.bookingTime.toISOString(),
            driver: driver
                ? {
                      firstname: driver.user.firstname,
                      lastname: driver.user.lastname,
                      phone: driver.user.phone,
                  }
                : undefined,
            driverLocation:
                driver && driver.locationLat != null && driver.locationLng != null
                    ? { lat: driver.locationLat, lng: driver.locationLng }
                    : null,
            trackingEvents: booking.bookingTrackingEvents.map((e) => ({
                eventType: e.eventType,
                timestamp: e.timestamp.toISOString(),
            })),
        };
    }

    /**
     * Returns a cached Mapbox Directions geometry (GeoJSON LineString) for
     * driver -> pickup. Cached in DB to reduce external API calls.
     */
    public async getTrackingRouteGeoJson(bookingId: string, userId: string): Promise<unknown | null> {
        const booking = await this.prisma.booking.findFirst({
            where: {
                id: bookingId,
                userId,
                dispatchStatus: { in: TRACKABLE_STATUSES },
            },
            select: {
                startLat: true,
                startLng: true,
                driver: { select: { locationLat: true, locationLng: true } },
            },
        });
        if (!booking) return null;
        const driver = booking.driver;
        if (!driver || driver.locationLat == null || driver.locationLng == null) return null;

        return await this.routeCacheService.getOrCreateRouteGeoJson({
            from: { lat: driver.locationLat, lng: driver.locationLng },
            to: { lat: booking.startLat, lng: booking.startLng },
            // Small-scale default: recompute at most every 30 minutes for same rounded coords.
            maxAgeMs: 30 * 60 * 1000,
        });
    }
}
