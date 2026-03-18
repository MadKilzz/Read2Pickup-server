import { latLngToCell } from "h3-js";
import { BookingStatus, DriverRequestStatus, DispatchStatus, DriverStatus, Prisma, QueueStatus, Role, TrackingEventType } from "@prisma/client";
import Service from "./Service";
import { DriverLocationData, DriverStatusData, type DispatchStatusLocation, type DriverRequestData } from "@/validation/driver";
import { emitTrackingEvent } from "@/socket";
import BookingTrackingEventService from "./BookingTrackingEventService";
import Snowflake from "@/utils/SnowFlake";

const DISPATCH_STATUS_TO_TRACKING_EVENT: Partial<Record<DispatchStatus, TrackingEventType>> = {
    [DispatchStatus.ON_THE_WAY]: TrackingEventType.ON_THE_WAY,
    [DispatchStatus.ARRIVED]: TrackingEventType.ARRIVED,
    [DispatchStatus.STARTED]: TrackingEventType.STARTED,
    [DispatchStatus.COMPLETED]: TrackingEventType.COMPLETED,
};

const H3_RESOLUTION = 9; // street-level

export default class DriverService extends Service {
    private bookingTrackingEventService = new BookingTrackingEventService();
    public async fetchOffers(options: Prisma.DispatchQueueFindManyArgs) {
        try {
            return await this.prisma.dispatchQueue.findMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async update(options: Prisma.DriverUpdateArgs) {
        try {
            return await this.prisma.driver.update({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async updateLocation(driverId: string, data: DriverLocationData) {
        const h3Index = latLngToCell(data.latitude, data.longitude, H3_RESOLUTION);
        return await this.prisma.driver.update({
            where: { id: driverId },
            data: {
                locationLat: data.latitude,
                locationLng: data.longitude,
                locationH3Index: h3Index,
                locationUpdatedAt: new Date(),
            } as Prisma.DriverUpdateInput,
        });
    }

    public async updateStatus(driverId: string, data: DriverStatusData) {
        const status = data.status as DriverStatus;
        return await this.prisma.driver.update({
            where: { id: driverId },
            data: { status },
        });
    }

    /** Booking IDs currently trackable (ON_THE_WAY or ARRIVED) for this driver. Used to broadcast location via Socket.IO. */
    public async getActiveTrackingBookingIds(driverId: string): Promise<string[]> {
        const bookings = await this.prisma.booking.findMany({
            where: {
                driverId,
                dispatchStatus: { in: [DispatchStatus.ON_THE_WAY, DispatchStatus.ARRIVED] },
            },
            select: { id: true },
        });
        return bookings.map((b) => b.id);
    }

    /**
     * Accept offer: this driver gets the booking; all other drivers' queue rows for that booking are set to EXPIRED.
     */
    public async acceptOffer(queueId: string, driverId: string): Promise<{ bookingId: string }> {
        return await this.transaction(async (tx) => {
            const row = await tx.dispatchQueue.findFirst({
                where: { id: queueId, driverId, status: QueueStatus.PENDING },
            });
            if (!row) throw new Error("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED");

            const now = new Date();
            await tx.dispatchQueue.update({
                where: { id: queueId },
                data: { status: QueueStatus.ACCEPTED, respondedAt: now },
            });
            await tx.booking.update({
                where: { id: row.bookingId },
                data: {
                    driverId,
                    dispatchStatus: DispatchStatus.ASSIGNED,
                    acceptedAt: now,
                    assignedAt: now,
                },
            });
            await tx.dispatchQueue.updateMany({
                where: { bookingId: row.bookingId, id: { not: queueId } },
                data: { status: QueueStatus.EXPIRED, respondedAt: now },
            });
            return { bookingId: row.bookingId };
        });
    }

    /**
     * When a booking is canceled: expire all PENDING dispatch queue entries for that booking
     * so the offer is no longer available to drivers.
     */
    public async expireQueueEntriesForBooking(bookingId: string): Promise<void> {
        await this.prisma.dispatchQueue.updateMany({
            where: { bookingId, status: QueueStatus.PENDING },
            data: { status: QueueStatus.EXPIRED, respondedAt: new Date() },
        });
    }

    /**
     * Decline offer: only this driver's queue row is set to DECLINED.
     */
    public async declineOffer(queueId: string, driverId: string): Promise<void> {
        await this.transaction(async (tx) => {
            const row = await tx.dispatchQueue.findFirst({
                where: { id: queueId, driverId, status: QueueStatus.PENDING },
            });
            if (!row) throw new Error("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED");
            await tx.dispatchQueue.update({
                where: { id: queueId },
                data: { status: QueueStatus.DECLINED, respondedAt: new Date() },
            });
        });
    }

    /** Allowed transitions: ASSIGNED→ON_THE_WAY, ON_THE_WAY→ARRIVED, ARRIVED→STARTED, STARTED→COMPLETED */
    private static readonly ALLOWED_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
        [DispatchStatus.PENDING]: [],
        [DispatchStatus.OFFERING]: [],
        [DispatchStatus.ASSIGNED]: [DispatchStatus.ON_THE_WAY],
        [DispatchStatus.ON_THE_WAY]: [DispatchStatus.ARRIVED],
        [DispatchStatus.ARRIVED]: [DispatchStatus.STARTED],
        [DispatchStatus.STARTED]: [DispatchStatus.COMPLETED],
        [DispatchStatus.COMPLETED]: [],
        [DispatchStatus.NO_DRIVER]: [],
        [DispatchStatus.CANCELED]: [],
        [DispatchStatus.NO_SHOW]: [],
    };

    public async fetchDriverBookings(
        driverId: string,
        filter: "upcoming" | "all"
    ): Promise<Prisma.BookingGetPayload<{ include: { CarType: { select: { name: true } }; user: { select: { firstname: true; lastname: true; gender: true } } } }>[]> {
        const statusesUpcoming: DispatchStatus[] = [
            DispatchStatus.ASSIGNED,
            DispatchStatus.ON_THE_WAY,
            DispatchStatus.ARRIVED,
            DispatchStatus.STARTED,
        ];
        const statuses = filter === "all" ? [...statusesUpcoming, DispatchStatus.COMPLETED] : statusesUpcoming;
        return await this.prisma.booking.findMany({
            where: { driverId, dispatchStatus: { in: statuses } },
            include: {
                CarType: { select: { name: true } },
                user: { select: { firstname: true, lastname: true, gender: true, phone: true } },
            },
            orderBy: { bookingTime: "asc" },
        });
    }

    /**
     * Updates booking dispatch status and creates a tracking event (with optional lat/lng).
     * Allowed transitions: ASSIGNED→ON_THE_WAY, ON_THE_WAY→ARRIVED, ARRIVED→STARTED, STARTED→COMPLETED.
     */
    public async updateBookingDispatchStatus(
        bookingId: string,
        driverId: string,
        newStatus: DispatchStatus,
        location?: DispatchStatusLocation
    ): Promise<void> {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId, driverId },
            select: { dispatchStatus: true },
        });
        if (!booking) throw new Error("BOOKING_NOT_FOUND_OR_NOT_ASSIGNED");
        const allowed = DriverService.ALLOWED_TRANSITIONS[booking.dispatchStatus];
        if (!allowed?.includes(newStatus)) throw new Error("INVALID_DISPATCH_STATUS_TRANSITION");
        await this.prisma.booking.update({
            where: { id: bookingId },
            data: { dispatchStatus: newStatus },
        });

        const eventType = DISPATCH_STATUS_TO_TRACKING_EVENT[newStatus];
        if (eventType) {
            const eventLocation =
                location?.latitude != null && location?.longitude != null
                    ? { latitude: location.latitude, longitude: location.longitude }
                    : undefined;
            const created = await this.bookingTrackingEventService.create(bookingId, eventType, eventLocation);
            emitTrackingEvent(bookingId, {
                eventType: created.eventType,
                timestamp: created.timestamp.toISOString(),
                ...(created.latitude != null && created.longitude != null
                    ? { latitude: created.latitude, longitude: created.longitude }
                    : {}),
            });
        }
    }

    /** Booking met user (email) voor o.a. notificaties. Alleen als de booking bij deze driver hoort. */
    public async getBookingWithUser(bookingId: string, driverId: string) {
        return await this.prisma.booking.findFirst({
            where: { id: bookingId, driverId },
            select: {
                id: true,
                user: { select: { email: true } },
            },
        });
    }

    /**
     * When dispatch status is COMPLETED: set booking status to COMPLETED and update driver's lastCompletedRideAt.
     * Runs in a transaction so both updates succeed or neither.
     */
    public async completeBooking(bookingId: string, driverId: string): Promise<void> {
        await this.transaction(async (tx) => {
            const booking = await tx.booking.findFirst({
                where: { id: bookingId, driverId },
                select: { id: true },
            });
            if (!booking) throw new Error("BOOKING_NOT_FOUND_OR_NOT_ASSIGNED");

            await tx.booking.update({
                where: { id: bookingId },
                data: { status: BookingStatus.COMPLETED },
            });

            await tx.driver.update({
                where: { id: driverId },
                data: { lastCompletedRideAt: new Date(), status: DriverStatus.AVAILABLE },
            });
        });
    }

    /** Get the current user's driver request (at most one per user). Returns id, status, createdAt, rejectedReason (for REJECTED). */
    public async getMyDriverRequest(userId: string) {
        return await this.prisma.driverRequest.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true, createdAt: true, rejectedReason: true },
        });
    }

    /** Create a driver application request (user is not yet a driver). Fails if user already has one. */
    public async createDriverRequest(userId: string, data: DriverRequestData) {
        return await this.prisma.driverRequest.create({
            data: {
                id: Snowflake.generate(),
                userId,
                companyName: data.companyName.trim(),
                companyAddress: data.companyAddress.trim(),
                companyCity: data.companyCity.trim(),
                companyPostcode: data.companyPostcode.trim(),
                registrationNumber: data.registrationNumber.replace(/\s/g, ""),
                vatNumber: data.vatNumber.replace(/\s/g, "").toUpperCase(),
                bankAccountHolder: data.bankAccountHolder.trim(),
                iban: data.iban.replace(/\s/g, "").toUpperCase(),
                message: data.message?.trim() || null,
            },
        });
    }

    /** List driver requests for dispatch panel (paginated, with user name/email). */
    public async listDriverRequestsForDispatch(params: {
        page: number;
        limit: number;
        search?: string;
        status?: DriverRequestStatus;
    }) {
        const { page, limit, search, status } = params;
        const skip = (page - 1) * limit;
        const where: Prisma.DriverRequestWhereInput = {};
        if (status) where.status = status;
        if (search?.trim()) {
            const q = search.trim().toLowerCase();
            where.OR = [
                { companyName: { contains: q, mode: "insensitive" } },
                { user: { email: { contains: q, mode: "insensitive" } } },
                { user: { firstname: { contains: q, mode: "insensitive" } } },
                { user: { lastname: { contains: q, mode: "insensitive" } } },
            ];
        }
        const [items, totalCount] = await Promise.all([
            this.prisma.driverRequest.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    companyName: true,
                    status: true,
                    createdAt: true,
                    rejectedReason: true,
                    user: {
                        select: {
                            id: true,
                            firstname: true,
                            lastname: true,
                            email: true,
                        },
                    },
                },
            }),
            this.prisma.driverRequest.count({ where }),
        ]);
        return { items, totalCount };
    }

    /** List active car types for dispatch (e.g. when accepting a driver request). */
    public async getActiveCarTypesForDispatch(): Promise<{ id: string; name: string }[]> {
        const types = await this.prisma.carType.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });
        return types;
    }

    /** Get one driver request by id for dispatch (full details). */
    public async getDriverRequestByIdForDispatch(id: string) {
        return await this.prisma.driverRequest.findUnique({
            where: { id },
            select: {
                id: true,
                companyName: true,
                companyAddress: true,
                companyCity: true,
                companyPostcode: true,
                registrationNumber: true,
                vatNumber: true,
                bankAccountHolder: true,
                iban: true,
                message: true,
                status: true,
                rejectedReason: true,
                createdAt: true,
                updatedAt: true,
                user: {
                    select: {
                        id: true,
                        firstname: true,
                        lastname: true,
                        email: true,
                    },
                },
            },
        });
    }

    /** Reject a driver request (only if status is PENDING). Sets rejectedReason. */
    public async rejectDriverRequest(id: string, rejectedReason: string): Promise<void> {
        const req = await this.prisma.driverRequest.findUnique({
            where: { id },
            select: { id: true, status: true },
        });
        if (!req) throw new Error("DRIVER_REQUEST_NOT_FOUND");
        if (req.status !== DriverRequestStatus.PENDING) throw new Error("DRIVER_REQUEST_NOT_PENDING");
        await this.prisma.driverRequest.update({
            where: { id },
            data: { status: DriverRequestStatus.REJECTED, rejectedReason: rejectedReason.trim() || null },
        });
    }

    /** Remove a rejected driver request so the user can submit a new one. Only allowed when status is REJECTED. */
    public async removeDriverRequest(id: string): Promise<void> {
        const req = await this.prisma.driverRequest.findUnique({
            where: { id },
            select: { id: true, status: true },
        });
        if (!req) throw new Error("DRIVER_REQUEST_NOT_FOUND");
        if (req.status !== DriverRequestStatus.REJECTED) throw new Error("DRIVER_REQUEST_NOT_REJECTED");
        await this.prisma.driverRequest.delete({ where: { id } });
    }

    /** Accept a PENDING driver request: create Driver profile with carTypeId, set User role to DRIVER, set request status to APPROVED. */
    public async acceptDriverRequest(id: string, carTypeId: string): Promise<void> {
        const req = await this.prisma.driverRequest.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                status: true,
                companyName: true,
                companyAddress: true,
                companyCity: true,
                companyPostcode: true,
                registrationNumber: true,
                vatNumber: true,
                bankAccountHolder: true,
                iban: true,
            },
        });
        if (!req) throw new Error("DRIVER_REQUEST_NOT_FOUND");
        if (req.status !== DriverRequestStatus.PENDING) throw new Error("DRIVER_REQUEST_NOT_PENDING");
        const existingDriver = await this.prisma.driver.findUnique({
            where: { id: req.userId },
            select: { id: true },
        });
        if (existingDriver) throw new Error("USER_ALREADY_DRIVER");

        const carType = await this.prisma.carType.findFirst({
            where: { id: carTypeId, isActive: true },
            select: { id: true },
        });
        if (!carType) throw new Error("CAR_TYPE_NOT_FOUND_OR_INACTIVE");

        await this.transaction(async (tx) => {
            await tx.driver.create({
                data: {
                    id: req.userId,
                    carTypeId: carTypeId,
                    companyName: req.companyName,
                    companyAddress: req.companyAddress,
                    companyCity: req.companyCity,
                    companyPostcode: req.companyPostcode,
                    registrationNumber: req.registrationNumber,
                    vatNumber: req.vatNumber,
                    bankAccountHolder: req.bankAccountHolder,
                    iban: req.iban,
                },
            });
            await tx.user.update({
                where: { id: req.userId },
                data: { role: Role.DRIVER },
            });
            await tx.driverRequest.update({
                where: { id },
                data: { status: DriverRequestStatus.APPROVED },
            });
        });
    }
}