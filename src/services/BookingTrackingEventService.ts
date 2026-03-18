import { TrackingEventType } from "@prisma/client";
import Service from "./Service";
import Snowflake from "@/utils/SnowFlake";

/** Location where the driver was when the tracking event occurred (e.g. arrived/started/completed). */
export type TrackingEventLocation = { latitude: number; longitude: number };

export default class BookingTrackingEventService extends Service {
    /**
     * Creates a tracking event for a booking (e.g. when driver status changes to ON_THE_WAY, ARRIVED, STARTED, COMPLETED).
     * Optionally stores the driver's latitude/longitude at the time of the event.
     */
    public async create(
        bookingId: string,
        eventType: TrackingEventType,
        location?: TrackingEventLocation
    ) {
        return await this.prisma.bookingTrackingEvent.create({
            data: {
                id: Snowflake.generate(),
                bookingId,
                eventType,
                latitude: location?.latitude,
                longitude: location?.longitude,
            },
        });
    }
}
