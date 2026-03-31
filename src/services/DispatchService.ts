import { BookingStatus, DispatchStatus, DriverStatus, Prisma, QueueStatus } from "@prisma/client";
import { gridDisk, latLngToCell } from "h3-js";
import LocationService from "./LocationService";
import config from "@/config";

export type DayStats = {
    total: number;
    completed: number;
    toDo: number;
    toComplete: number;
    activeOrders: number;
    donutToComplete: { name: string; value: number }[];
    donutActive: { name: string; value: number }[];
};

export type DashboardStatsPayload = {
    today: DayStats;
    yesterday: Omit<DayStats, "donutToComplete" | "donutActive">;
};
import Service from "./Service";
import Snowflake from "@/utils/SnowFlake";

/** Dispatcher may reassign or unassign only before the trip is underway (not ON_THE_WAY / ARRIVED / STARTED). */
const REASSIGNABLE_STATUSES: DispatchStatus[] = [DispatchStatus.ASSIGNED];

/** Dispatcher may only set NO_SHOW (passenger did not cancel but did not show). Canceled = customer only. */
const DISPATCHER_STATUS_TRANSITIONS: Partial<Record<DispatchStatus, DispatchStatus[]>> = {
    [DispatchStatus.ARRIVED]: [DispatchStatus.NO_SHOW],
    [DispatchStatus.STARTED]: [DispatchStatus.NO_SHOW],
};

export default class DispatchService extends Service {
    private locationService = new LocationService();

    public async fetchBookingsForDispatch(options: Prisma.BookingFindManyArgs) {
        try {
            return await this.prisma.booking.findMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchBookingCountForDispatch(options: Prisma.BookingCountArgs) {
        try {
            return await this.prisma.booking.count({ ...options });
        } catch (e) {
            throw e;
        }
    }

    /** Dashboard stats: counts by dispatch status for a day. Excludes CANCELED and NO_SHOW from total. */
    private buildDayStatsFromGroup(
        grouped: { dispatchStatus: DispatchStatus; _count: { id: number } }[]
    ): DayStats {
        const byStatus: Record<string, number> = {};
        for (const row of grouped) {
            byStatus[row.dispatchStatus] = row._count.id;
        }
        const get = (s: DispatchStatus) => byStatus[s] ?? 0;
        const total =
            get(DispatchStatus.PENDING) +
            get(DispatchStatus.OFFERING) +
            get(DispatchStatus.NO_DRIVER) +
            get(DispatchStatus.ASSIGNED) +
            get(DispatchStatus.ON_THE_WAY) +
            get(DispatchStatus.ARRIVED) +
            get(DispatchStatus.STARTED) +
            get(DispatchStatus.COMPLETED);
        const completed = get(DispatchStatus.COMPLETED);
        const toDo = total - completed;
        const activeOrders =
            get(DispatchStatus.ASSIGNED) +
            get(DispatchStatus.ON_THE_WAY) +
            get(DispatchStatus.ARRIVED) +
            get(DispatchStatus.STARTED);
        const toComplete = total - completed;
        const pendingCount =
            get(DispatchStatus.PENDING) +
            get(DispatchStatus.NO_DRIVER) +
            get(DispatchStatus.OFFERING);
        const inProgressCount = activeOrders;
        const enRouteCount = get(DispatchStatus.ASSIGNED) + get(DispatchStatus.ON_THE_WAY);
        const pickedUpCount = get(DispatchStatus.ARRIVED) + get(DispatchStatus.STARTED);
        return {
            total,
            completed,
            toDo,
            toComplete,
            activeOrders,
            donutToComplete: [
                { name: "Pending", value: pendingCount },
                { name: "In progress", value: inProgressCount },
            ],
            donutActive: [
                { name: "En route", value: enRouteCount },
                { name: "Picked up", value: pickedUpCount },
            ],
        };
    }

    public async fetchDashboardStats(): Promise<DashboardStatsPayload> {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const yesterdayEnd = new Date(yesterdayStart);
        yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

        const whereBase = {
            dispatchStatus: { notIn: [DispatchStatus.CANCELED, DispatchStatus.NO_SHOW] },
        };

        const [todayGrouped, yesterdayGrouped] = await Promise.all([
            this.prisma.booking.groupBy({
                by: ["dispatchStatus"],
                _count: { id: true },
                where: {
                    ...whereBase,
                    bookingTime: { gte: todayStart, lt: todayEnd },
                },
            }),
            this.prisma.booking.groupBy({
                by: ["dispatchStatus"],
                _count: { id: true },
                where: {
                    ...whereBase,
                    bookingTime: { gte: yesterdayStart, lt: yesterdayEnd },
                },
            }),
        ]);

        const today = this.buildDayStatsFromGroup(
            todayGrouped as { dispatchStatus: DispatchStatus; _count: { id: number } }[]
        );
        const yesterdayFull = this.buildDayStatsFromGroup(
            yesterdayGrouped as { dispatchStatus: DispatchStatus; _count: { id: number } }[]
        );

        return {
            today,
            yesterday: {
                total: yesterdayFull.total,
                completed: yesterdayFull.completed,
                toDo: yesterdayFull.toDo,
                toComplete: yesterdayFull.toComplete,
                activeOrders: yesterdayFull.activeOrders,
            },
        };
    }

    public async fetchBookingByIdForDispatch(options: Prisma.BookingFindFirstArgs) {
        try {
            return await this.prisma.booking.findFirst({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async fetchDriversForDispatch(params: {
        availableOnly?: boolean;
        search?: string;
        mode?: "default" | "nearest";
        limit?: number;
        bookingId: string;
    }) {
        const where: Prisma.DriverWhereInput = {};
        const mode = params.mode ?? "default";
        const limit = params.limit && params.limit > 0 ? params.limit : undefined;
        const search = params.search?.trim();

        let bookingCoords: { lat: number; lng: number } | null = null;
        const booking = await this.prisma.booking.findFirst({
            where: { id: params.bookingId },
            select: { startLat: true, startLng: true, carTypeId: true },
        });

        if (!booking) throw new Error("BOOKING_NOT_FOUND");
        if (!booking.carTypeId) throw new Error("BOOKING_CAR_TYPE_MISSING");

        if (booking.startLat != null && booking.startLng != null) {
            bookingCoords = { lat: booking.startLat, lng: booking.startLng };
        }

        // Default: exact car type match for this booking.
        where.carTypeId = booking.carTypeId;
        if (params.availableOnly) where.status = DriverStatus.AVAILABLE;
        if (search && search.length >= 2) {
            // While searching, also include higher/compatible car types (same or better capacity/cost tier).
            const bookingCarType = await this.prisma.carType.findFirst({
                where: { id: booking.carTypeId },
                select: { seats: true, luggage: true, baseFare: true, pricePerKm: true, pricePerMin: true },
            });

            if (bookingCarType) {
                const compatibleCarTypes = await this.prisma.carType.findMany({
                    where: {
                        isActive: true,
                        seats: { gte: bookingCarType.seats },
                        luggage: { gte: bookingCarType.luggage },
                        baseFare: { gte: bookingCarType.baseFare },
                        pricePerKm: { gte: bookingCarType.pricePerKm },
                        pricePerMin: { gte: bookingCarType.pricePerMin },
                    },
                    select: { id: true },
                });
                if (compatibleCarTypes.length > 0) {
                    where.carTypeId = { in: compatibleCarTypes.map((c) => c.id) };
                }
            }

            where.user = {
                OR: [
                    { firstname: { contains: search, mode: "insensitive" } },
                    { lastname: { contains: search, mode: "insensitive" } },
                ],
            };
        }
        if (mode !== "nearest" || !bookingCoords) {
            return await this.prisma.driver.findMany({
                where,
                select: {
                    id: true,
                    status: true,
                    user: { select: { id: true, firstname: true, lastname: true, phone: true } },
                    CarType: { select: { name: true } },
                },
                ...(limit ? { take: limit } : {}),
            });
        }

        // Nearest mode: H3 shortlist around pickup, then precise distance sort.
        const centerCell = latLngToCell(bookingCoords.lat, bookingCoords.lng, config.geo.h3Resolution);
        const nearbyCells = gridDisk(centerCell, config.geo.nearestMaxRing);
        where.locationH3Index = { in: nearbyCells };
        where.locationLat = { not: null };
        where.locationLng = { not: null };

        const candidates = await this.prisma.driver.findMany({
            where,
            select: {
                id: true,
                status: true,
                locationLat: true,
                locationLng: true,
                user: { select: { id: true, firstname: true, lastname: true, phone: true } },
                CarType: { select: { name: true } },
            },
        });

        const sorted = candidates
            .filter((d) => d.locationLat != null && d.locationLng != null)
            .map((d) => ({
                id: d.id,
                status: d.status,
                user: d.user,
                CarType: d.CarType,
                distanceKm: this.locationService.calculateDistanceKm(
                    bookingCoords!.lat,
                    bookingCoords!.lng,
                    d.locationLat as number,
                    d.locationLng as number
                ),
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm);

        return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
    }

    public async reassignBooking(bookingId: string, driverId: string): Promise<void> {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId },
            select: { dispatchStatus: true },
        });
        if (!booking) throw new Error("BOOKING_NOT_FOUND");
        if (!REASSIGNABLE_STATUSES.includes(booking.dispatchStatus))
            throw new Error("REASSIGN_NOT_ALLOWED");

        const driver = await this.prisma.driver.findFirst({
            where: { id: driverId },
            select: { id: true },
        });
        if (!driver) throw new Error("DRIVER_NOT_FOUND");

        const now = new Date();
        await this.prisma.booking.update({
            where: { id: bookingId },
            data: {
                driverId: driverId,
                assignedAt: now,
                acceptedAt: now,
                dispatchStatus: DispatchStatus.ASSIGNED,
            },
        });
    }

    /** Clear the assigned driver and return the booking to NO_DRIVER (dispatcher). Same status rules as reassign. */
    public async unassignCurrentDriver(bookingId: string): Promise<void> {
        await this.transaction(async (tx) => {
            const booking = await tx.booking.findFirst({
                where: { id: bookingId },
                select: { driverId: true, dispatchStatus: true },
            });
            if (!booking) throw new Error("BOOKING_NOT_FOUND");
            if (!REASSIGNABLE_STATUSES.includes(booking.dispatchStatus))
                throw new Error("REASSIGN_NOT_ALLOWED");
            if (!booking.driverId) throw new Error("NO_DRIVER_ASSIGNED");

            const formerDriverId = booking.driverId;
            const now = new Date();

            await tx.dispatchQueue.updateMany({
                where: {
                    bookingId,
                    driverId: formerDriverId,
                    status: { in: [QueueStatus.PENDING, QueueStatus.ACCEPTED] },
                },
                data: { status: QueueStatus.EXPIRED, respondedAt: now },
            });

            await tx.booking.update({
                where: { id: bookingId },
                data: {
                    driverId: null,
                    assignedAt: null,
                    acceptedAt: null,
                    dispatchStatus: DispatchStatus.NO_DRIVER,
                },
            });
        });
    }

    public async updateBookingDispatchStatusByDispatcher(
        bookingId: string,
        newStatus: DispatchStatus
    ): Promise<void> {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId },
            select: { dispatchStatus: true, driverId: true },
        });
        if (!booking) throw new Error("BOOKING_NOT_FOUND");
        const allowed = DISPATCHER_STATUS_TRANSITIONS[booking.dispatchStatus];
        if (newStatus !== DispatchStatus.NO_SHOW) {
            throw new Error("DISPATCH_PATCH_NO_SHOW_ONLY");
        }
        if (!allowed?.includes(newStatus)) throw new Error("INVALID_DISPATCH_STATUS_TRANSITION");

        await this.transaction(async (tx) => {
            const driverId = booking.driverId;
            if (driverId) {
                await tx.driver.update({
                    where: { id: driverId },
                    data: { status: DriverStatus.AVAILABLE },
                });
            }
            await tx.booking.update({
                where: { id: bookingId },
                data: {
                    dispatchStatus: DispatchStatus.NO_SHOW,
                    status: BookingStatus.NO_SHOW,
                },
            });
        });
    }

    /** Offer this booking to one driver (create or reset queue row). Allowed when booking is OFFERING or NO_DRIVER. */
    public async offerBookingToDriver(bookingId: string, driverId: string): Promise<void> {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId },
            select: { id: true, dispatchStatus: true, carTypeId: true },
        });
        if (!booking) throw new Error("BOOKING_NOT_FOUND");
        if (
            booking.dispatchStatus !== DispatchStatus.OFFERING &&
            booking.dispatchStatus !== DispatchStatus.NO_DRIVER
        ) {
            throw new Error("OFFER_NOT_ALLOWED_FOR_STATUS");
        }

        const driver = await this.prisma.driver.findFirst({
            where: { id: driverId },
            select: { id: true, carTypeId: true },
        });
        if (!driver) throw new Error("DRIVER_NOT_FOUND");
        if (driver.carTypeId !== booking.carTypeId) throw new Error("DRIVER_CAR_TYPE_MISMATCH");

        const existing = await this.prisma.dispatchQueue.findUnique({
            where: {
                bookingId_driverId: { bookingId, driverId },
            },
            select: { id: true, status: true },
        });

        const now = new Date();
        if (existing) {
            if (existing.status === QueueStatus.PENDING || existing.status === QueueStatus.ACCEPTED) {
                throw new Error("ALREADY_OFFERED_OR_ACCEPTED");
            }
            await this.prisma.dispatchQueue.update({
                where: { id: existing.id },
                data: { status: QueueStatus.PENDING, respondedAt: null },
            });
        } else {
            await this.prisma.dispatchQueue.create({
                data: {
                    id: Snowflake.generate(),
                    bookingId,
                    driverId,
                    status: QueueStatus.PENDING,
                },
            });
        }

        if (booking.dispatchStatus === DispatchStatus.NO_DRIVER) {
            await this.prisma.booking.update({
                where: { id: bookingId },
                data: { dispatchStatus: DispatchStatus.OFFERING },
            });
        }
    }

    /** Cancel (expire) a pending offer from the dispatch panel. */
    public async cancelOffer(bookingId: string, driverId: string): Promise<void> {
        await this.transaction(async (tx) => {
            const row = await tx.dispatchQueue.findFirst({
                where: { bookingId, driverId, status: QueueStatus.PENDING },
                select: { id: true },
            });
            if (!row) throw new Error("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED");

            const now = new Date();
            await tx.dispatchQueue.update({
                where: { id: row.id },
                data: { status: QueueStatus.EXPIRED, respondedAt: now },
            });

            const pendingCount = await tx.dispatchQueue.count({
                where: { bookingId, status: QueueStatus.PENDING },
            });

            // If no pending offers remain, move booking back to NO_DRIVER.
            if (pendingCount === 0) {
                await tx.booking.updateMany({
                    where: { id: bookingId, dispatchStatus: DispatchStatus.OFFERING },
                    data: { dispatchStatus: DispatchStatus.NO_DRIVER },
                });
            }
        });
    }
}
