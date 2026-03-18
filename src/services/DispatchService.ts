import { DispatchStatus, DriverStatus, Prisma, QueueStatus } from "@prisma/client";

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

const REASSIGNABLE_STATUSES: DispatchStatus[] = [
    DispatchStatus.ASSIGNED,
    DispatchStatus.ON_THE_WAY,
    DispatchStatus.ARRIVED,
];

const DISPATCHER_STATUS_TRANSITIONS: Partial<Record<DispatchStatus, DispatchStatus[]>> = {
    [DispatchStatus.ASSIGNED]: [DispatchStatus.NO_SHOW, DispatchStatus.CANCELED],
    [DispatchStatus.ON_THE_WAY]: [DispatchStatus.NO_SHOW, DispatchStatus.CANCELED],
    [DispatchStatus.ARRIVED]: [DispatchStatus.NO_SHOW, DispatchStatus.CANCELED],
};

export default class DispatchService extends Service {
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
        carTypeId?: string;
        availableOnly?: boolean;
        search?: string;
    }) {
        const where: Prisma.DriverWhereInput = {};
        if (params.carTypeId) where.carTypeId = params.carTypeId;
        if (params.availableOnly) where.status = DriverStatus.AVAILABLE;
        const search = params.search?.trim();
        if (search && search.length >= 2) {
            where.user = {
                OR: [
                    { firstname: { contains: search, mode: "insensitive" } },
                    { lastname: { contains: search, mode: "insensitive" } },
                ],
            };
        }
        return await this.prisma.driver.findMany({
            where,
            select: {
                id: true,
                status: true,
                user: { select: { id: true, firstname: true, lastname: true, email: true } },
                CarType: { select: { name: true } },
            },
        });
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

    public async updateBookingDispatchStatusByDispatcher(
        bookingId: string,
        newStatus: DispatchStatus
    ): Promise<void> {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId },
            select: { dispatchStatus: true },
        });
        if (!booking) throw new Error("BOOKING_NOT_FOUND");
        const allowed = DISPATCHER_STATUS_TRANSITIONS[booking.dispatchStatus];
        if (!allowed?.includes(newStatus)) throw new Error("INVALID_DISPATCH_STATUS_TRANSITION");
        await this.prisma.booking.update({
            where: { id: bookingId },
            data: { dispatchStatus: newStatus },
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
        const row = await this.prisma.dispatchQueue.findFirst({
            where: { bookingId, driverId, status: QueueStatus.PENDING },
            select: { id: true },
        });
        if (!row) throw new Error("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED");
        await this.prisma.dispatchQueue.update({
            where: { id: row.id },
            data: { status: QueueStatus.EXPIRED, respondedAt: new Date() },
        });
    }
}
