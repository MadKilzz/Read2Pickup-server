import {
    BookingStatus,
    DispatchStatus,
    DriverStatus,
    Prisma,
    PrismaClient,
    QueueStatus,
    User,
} from "@prisma/client";
import axios from "axios";
import Service from "./Service";

/**
 * Pricing model – Premium reserveringen (geen on-demand ritten).
 *
 * Positionering:
 * - Vooraf geboekte ritten (min. 1 uur vooruit)
 * - Betrouwbaarheid boven prijs
 * - Bescherming van korte stadsritten
 *
 * Formule:
 * - baseFare + (km × pricePerKm)
 * - + (min × pricePerMin) bij ritten < LONG_RIDE_NO_TIME_THRESHOLD_KM
 * - Onder SHORT_RESERVATION_THRESHOLD_KM geldt minimaal MINIMUM_RESERVATION_EUR
 */

export const RIDE_PRICING_DEFAULTS = {
    /** Minimumprijs voor elke reservering (beschermt marge en chauffeurstijd). */
    MINIMUM_RESERVATION_EUR: 25,

    /** Tot deze afstand (km) wordt minimumprijs afgedwongen. */
    SHORT_RESERVATION_THRESHOLD_KM: 7,

    /** Boven deze afstand (km) vervalt tijdstarief (alleen base + km). */
    LONG_RIDE_NO_TIME_THRESHOLD_KM: 15,

    /** Fallback multiplier bij ontbreken van tijdstarief. */
    SHORT_RIDE_THRESHOLD_KM: 20,
    SHORT_RIDE_PRICE_MULTIPLIER: 1.15,

    /** Optioneel: vaste reserveringsfee (kan later aan gezet worden). */
    RESERVATION_FEE: 0,
} as const;

/** Opties voor het berekenen van de ritprijs. Per class: andere baseFare/pricePerKm/pricePerMin uit CarType. */
export interface CalculateRidePriceParams {
    /** Afstand in meters. */
    distanceMeters: number;
    /** Starttarief (base fare) in euro – uit DB. */
    baseFare: number;
    /** Prijs per kilometer in euro – uit DB. */
    pricePerKm: number;
    /** Prijs per minuut in euro – uit DB. Bij invullen: officieel metertarief (base + km + min). */
    pricePerMin?: number;
    /** Rijtijd in seconden. Verplicht als pricePerMin wordt gebruikt. */
    durationSeconds?: number;
}

/** Optionele overschrijvingen; standaard altijd reserveringstarief (min €20 kort, boven 15 km geen tijd). */
export interface CalculateRidePriceOptions {
    minimumFareReservation?: number;
    shortReservationThresholdKm?: number;
    longRideNoTimeThresholdKm?: number;
    shortRideThresholdKm?: number;
    shortRidePriceMultiplier?: number;
}

export default class BookService extends Service {

    public metersToKilometers(meters: number): number {
        return meters / 1000;
    }

    public secondsToMinutes(seconds: number): number {
        return seconds / 60;
    }

    /**
     * Berekent ritprijs voor een reservering (geen last-moment ritten)
     * - Gebruik CarType velden als aanwezig
     * - Val terug op defaults indien undefined
     */
    public calculateRidePrice(
        params: CalculateRidePriceParams,
        options: CalculateRidePriceOptions = {}
    ): number {
        const { distanceMeters, baseFare, pricePerKm, pricePerMin, durationSeconds } = params;
        const distanceKm = this.metersToKilometers(distanceMeters);

        // fallback naar defaults indien opties niet zijn meegegeven
        const minReservation =
            options.minimumFareReservation ?? RIDE_PRICING_DEFAULTS.MINIMUM_RESERVATION_EUR;
        const shortThreshold =
            options.shortReservationThresholdKm ?? RIDE_PRICING_DEFAULTS.SHORT_RESERVATION_THRESHOLD_KM;
        const longNoTimeThreshold =
            options.longRideNoTimeThresholdKm ?? RIDE_PRICING_DEFAULTS.LONG_RIDE_NO_TIME_THRESHOLD_KM;

        // basisprijs
        let price = baseFare + distanceKm * pricePerKm;

        // tijdstarief lineair afbouwen van shortThreshold → longNoTimeThreshold
        if (pricePerMin && durationSeconds) {
            let timeMultiplier = 1; // volledige tijdstarief
            if (distanceKm >= shortThreshold && distanceKm <= longNoTimeThreshold) {
                timeMultiplier = (longNoTimeThreshold - distanceKm) / (longNoTimeThreshold - shortThreshold);
            } else if (distanceKm > longNoTimeThreshold) {
                timeMultiplier = 0; // boven threshold geen tijdstarief
            }
            price += this.secondsToMinutes(durationSeconds) * pricePerMin * timeMultiplier;
        }

        // minimumprijs voor korte ritten
        if (distanceKm < shortThreshold) {
            price = Math.max(price, minReservation);
        }

        return this.makePriceMoreAttractive(parseFloat(price.toFixed(2)));
    }

    public makePriceMoreAttractive(price: number): number {
        const isRounded = price % 1 === 0;

        if (isRounded) {
            return parseFloat((price - 0.01).toFixed(2));
        }

        return parseFloat(price.toFixed(2));
    }

    /**
     * Haalt afstand en rijtijd op tussen twee punten via Google Routes API (nieuwe API).
     * Zelfde key als Places (GOOGLE_PLACES_API_KEY). Zet "Routes API" aan in Cloud Console.
     * Bij miss/fout: fallback op haversine + geschatte duur.
     */
    public async getRouteData(startLat: number, startLng: number, endLat: number, endLng: number): Promise<{
        distance: { formated: string; value: number };
        duration: { formated: string; value: number };
    }> {
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (apiKey) {
            try {
                const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
                const res = await axios.post(
                    url,
                    {
                        origin: {
                            location: { latLng: { latitude: startLat, longitude: startLng } },
                        },
                        destination: {
                            location: { latLng: { latitude: endLat, longitude: endLng } },
                        },
                        travelMode: "DRIVE",
                        units: "METRIC",
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "X-Goog-Api-Key": apiKey,
                            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
                        },
                    }
                );
                const route = res.data?.routes?.[0];
                if (route?.distanceMeters != null && route?.duration != null) {
                    const durationSeconds = this.parseDurationToSeconds(route.duration);
                    const distanceKm = (route.distanceMeters / 1000).toFixed(1);
                    const mins = Math.round(durationSeconds / 60);
                    return {
                        distance: { formated: `${distanceKm} km`, value: route.distanceMeters },
                        duration: { formated: `${mins} min`, value: durationSeconds },
                    };
                }
            } catch {
                // fallback hieronder
            }
        }

        // Fallback: haversine afstand + geschatte rijtijd (bijv. 30 km/h gemiddeld in stad)
        const distanceKm = this.haversineDistance(startLat, startLng, endLat, endLng);
        const distanceMeters = Math.round(distanceKm * 1000);
        const estimatedMinutes = Math.max(1, Math.round((distanceKm / 30) * 60));
        const durationSeconds = estimatedMinutes * 60;
        return {
            distance: { formated: `${distanceKm.toFixed(1)} km`, value: distanceMeters },
            duration: { formated: `${estimatedMinutes} min`, value: durationSeconds },
        };
    }

    /** Routes API geeft duration als "123s" of "2h 5m" – parsen naar seconden. */
    private parseDurationToSeconds(duration: string): number {
        if (typeof duration !== "string") return 0;
        const match = duration.trim().match(/^(\d+)s$/);
        if (match) return parseInt(match[1], 10);
        const hoursMatch = duration.match(/(\d+)h/);
        const minsMatch = duration.match(/(\d+)m/);
        const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
        const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
        return hours * 3600 + mins * 60;
    }

    public haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
        const toRad = (x: number) => x * Math.PI / 180;
        const R = 6371; // Earth radius in km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    public combineDateTime(date: Date, time: string): Date {
        const [hours, minutes] = time.split(":").map(Number);
        const dateTime = new Date(date);
        dateTime.setHours(hours, minutes, 0, 0);
        return dateTime;
    }


    public async updateBooking(options: Prisma.BookingUpdateArgs) {
        try {
            return await this.prisma.booking.update({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchBooking(options: Prisma.BookingFindFirstArgs) {
        try {
            return await this.prisma.booking.findFirst({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async updateManyBookings(options: Prisma.BookingUpdateManyArgs) {
        try {
            return await this.prisma.booking.updateMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    /**
     * Passenger cancel: queue laten verlopen, boeking eerst CANCELED + driverId weg, daarna chauffeur AVAILABLE.
     */
    public async cancelBookingAtomic(bookingId: string): Promise<void> {
        await this.transaction(async (tx) => {
            const now = new Date();
            const b = await tx.booking.findFirst({
                where: { id: bookingId },
                select: { driverId: true },
            });
            if (!b) return;

            await tx.dispatchQueue.updateMany({
                where: { bookingId, status: QueueStatus.PENDING },
                data: { status: QueueStatus.EXPIRED, respondedAt: now },
            });

            if (b.driverId) {
                await tx.dispatchQueue.updateMany({
                    where: {
                        bookingId,
                        driverId: b.driverId,
                        status: QueueStatus.ACCEPTED,
                    },
                    data: { status: QueueStatus.EXPIRED, respondedAt: now },
                });
            }

            // Eerst boeking ontkoppelen/annuleren, daarna chauffeur vrij (race met driver PATCH).
            await tx.booking.updateMany({
                where: { id: bookingId, status: { not: BookingStatus.CANCELED } },
                data: {
                    status: BookingStatus.CANCELED,
                    dispatchStatus: DispatchStatus.CANCELED,
                    driverId: null,
                    assignedAt: null,
                    acceptedAt: null,
                },
            });

            if (b.driverId) {
                await tx.driver.update({
                    where: { id: b.driverId },
                    data: { status: DriverStatus.AVAILABLE },
                });
            }
        });
    }

    public async fetchBookingCount(options: Prisma.BookingCountArgs) {
        try {
            return await this.prisma.booking.count({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchBookings(options: Prisma.BookingFindManyArgs) {
        try {
            return await this.prisma.booking.findMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async draft(options: Prisma.BookingDraftCreateArgs) {
        try {
            return await this.prisma.bookingDraft.create({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchDraft(options: Prisma.BookingDraftFindFirstArgs) {
        try {
            return await this.prisma.bookingDraft.findFirst({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async updateDraft(options: Prisma.BookingDraftUpdateArgs) {
        try {
            return await this.prisma.bookingDraft.update({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchCarType(options?: Prisma.CarTypeFindFirstArgs) {
        try {
            return await this.prisma.carType.findFirst({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchCarTypes(options?: Prisma.CarTypeFindManyArgs) {
        try {
            return await this.prisma.carType.findMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async createBooking(options: Prisma.BookingDraftCreateArgs) {
        try {
            return await this.prisma.bookingDraft.create({ ...options });
        } catch (e) {
            throw e;
        }
    }
}