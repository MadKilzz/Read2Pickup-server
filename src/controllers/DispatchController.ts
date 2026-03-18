import { Request, Response } from "express";
import Controller from "./controller";
import DispatchService from "@/services/DispatchService";
import DriverService from "@/services/DriverService";
import { DispatchStatus, DriverRequestStatus } from "@prisma/client";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import type {
    ReassignData,
    DispatcherDispatchStatusData,
    OfferToDriverData,
    CancelOfferData,
    RejectDriverRequestData,
    AcceptDriverRequestData,
} from "@/validation/dispatch";

const dispatchSelect = {
    id: true,
    carTypeId: true,
    startAddress: true,
    endAddress: true,
    bookingTime: true,
    status: true,
    dispatchStatus: true,
    price: true,
    flightNumber: true,
    notes: true,
    CarType: { select: { name: true } },
    driver: {
        select: {
            id: true,
            user: { select: { email: true, firstname: true, lastname: true } },
        },
    },
};

export default class DispatchController extends Controller {
    private dispatchService: DispatchService = new DispatchService();
    private driverService: DriverService = new DriverService();

    public async getBookings(req: Request, res: Response) {
        try {
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const { date, dispatchStatus } = req.query as { date?: string; dispatchStatus?: string };

            const where: Record<string, unknown> = {};

            if (date) {
                const day = new Date(date);
                day.setHours(0, 0, 0, 0);
                const nextDay = new Date(day);
                nextDay.setDate(nextDay.getDate() + 1);
                where.bookingTime = {
                    gte: day,
                    lt: nextDay,
                };
            }

            if (dispatchStatus && Object.values(DispatchStatus).includes(dispatchStatus as DispatchStatus)) {
                where.dispatchStatus = dispatchStatus;
            }

            const totalCount = await this.dispatchService.fetchBookingCountForDispatch({ where });
            const totalPages = Math.ceil(totalCount / limit);

            const bookings = await this.dispatchService.fetchBookingsForDispatch({
                where,
                select: dispatchSelect,
                orderBy: { bookingTime: "asc" },
                skip,
                take: limit,
            });

            return res.json({
                code: 200,
                message: null,
                bookings,
                pagination: { page, limit, totalCount, totalPages },
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async getBooking(req: Request, res: Response) {
        try {
            const id = req.params.id;
            if (!id) return new this.ApiError("MISSING_BOOKING_ID").send(res);

            const booking = await this.dispatchService.fetchBookingByIdForDispatch({
                where: { id },
                select: {
                    ...dispatchSelect,
                    user: { select: { id: true, email: true } },
                    DispatchQueue: {
                        select: {
                            id: true,
                            status: true,
                            offeredAt: true,
                            respondedAt: true,
                            driver: {
                                select: {
                                    id: true,
                                    user: { select: { email: true, firstname: true, lastname: true } },
                                },
                            },
                        },
                    },
                },
            });

            if (!booking) return new this.ApiError("BOOKING_NOT_FOUND").send(res);

            return res.json({
                code: 200,
                message: null,
                booking,
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async getDrivers(req: Request, res: Response) {
        try {
            const { carTypeId, availableOnly, search } = req.query as {
                carTypeId?: string;
                availableOnly?: string;
                search?: string;
            };
            const drivers = await this.dispatchService.fetchDriversForDispatch({
                carTypeId: carTypeId || undefined,
                availableOnly: availableOnly === "true",
                search: search || undefined,
            });
            return res.json({ code: 200, message: null, drivers });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async getDashboardStats(_req: Request, res: Response) {
        try {
            const stats = await this.dispatchService.fetchDashboardStats();
            return res.json({ code: 200, message: null, ...stats });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async reassignBooking(req: ValidatedRequest<ReassignData>, res: Response) {
        try {
            const bookingId = req.params.id;
            if (!bookingId) return new this.ApiError("MISSING_BOOKING_ID").send(res);
            const { driverId } = req.validatedBody!;
            await this.dispatchService.reassignBooking(bookingId, driverId);
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "BOOKING_NOT_FOUND")
                    return new this.ApiError("BOOKING_NOT_FOUND").send(res);
                if (e.message === "REASSIGN_NOT_ALLOWED")
                    return new this.ApiError("REASSIGN_NOT_ALLOWED").send(res);
                if (e.message === "DRIVER_NOT_FOUND")
                    return new this.ApiError("DRIVER_NOT_FOUND").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async patchDispatchStatus(req: ValidatedRequest<DispatcherDispatchStatusData>, res: Response) {
        try {
            const bookingId = req.params.id;
            if (!bookingId) return new this.ApiError("MISSING_BOOKING_ID").send(res);
            const { dispatchStatus } = req.validatedBody!;
            await this.dispatchService.updateBookingDispatchStatusByDispatcher(
                bookingId,
                dispatchStatus as DispatchStatus
            );
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "BOOKING_NOT_FOUND")
                    return new this.ApiError("BOOKING_NOT_FOUND").send(res);
                if (e.message === "INVALID_DISPATCH_STATUS_TRANSITION")
                    return new this.ApiError("INVALID_DISPATCH_STATUS_TRANSITION").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async offerToDriver(req: ValidatedRequest<OfferToDriverData>, res: Response) {
        try {
            const bookingId = req.params.id;
            if (!bookingId) return new this.ApiError("MISSING_BOOKING_ID").send(res);
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);
            const { driverId } = req.validatedBody!;
            await this.dispatchService.offerBookingToDriver(bookingId, driverId);
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "BOOKING_NOT_FOUND")
                    return new this.ApiError("BOOKING_NOT_FOUND").send(res);
                if (e.message === "DRIVER_NOT_FOUND")
                    return new this.ApiError("DRIVER_NOT_FOUND").send(res);
                if (e.message === "OFFER_NOT_ALLOWED_FOR_STATUS")
                    return new this.ApiError("OFFER_NOT_ALLOWED_FOR_STATUS").send(res);
                if (e.message === "DRIVER_CAR_TYPE_MISMATCH")
                    return new this.ApiError("DRIVER_CAR_TYPE_MISMATCH").send(res);
                if (e.message === "ALREADY_OFFERED_OR_ACCEPTED")
                    return new this.ApiError("ALREADY_OFFERED_OR_ACCEPTED").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async cancelOffer(req: ValidatedRequest<CancelOfferData>, res: Response) {
        try {
            const bookingId = req.params.id;
            if (!bookingId) return new this.ApiError("MISSING_BOOKING_ID").send(res);
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);
            const { driverId } = req.validatedBody!;
            await this.dispatchService.cancelOffer(bookingId, driverId);
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "OFFER_NOT_FOUND_OR_ALREADY_RESPONDED")
                    return new this.ApiError("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** List driver requests for dispatch panel (paginated, max 5 per page default). */
    public async getDriverRequests(req: Request, res: Response) {
        try {
            const page = Number(req.query.page) || 1;
            const limit = Math.min(Number(req.query.limit) || 5, 20);
            const search = (req.query.search as string) || undefined;
            const status = (req.query.status as string) || undefined;

            const { items, totalCount } = await this.driverService.listDriverRequestsForDispatch({
                page,
                limit,
                search: search?.trim() || undefined,
                status: status && Object.values(DriverRequestStatus).includes(status as DriverRequestStatus) ? (status as DriverRequestStatus) : undefined,
            });

            const totalPages = Math.ceil(totalCount / limit);
            return res.json({
                code: 200,
                message: null,
                driverRequests: items,
                pagination: { page, limit, totalCount, totalPages },
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** Get one driver request by id for dispatch. */
    public async getDriverRequest(req: Request, res: Response) {
        try {
            const id = req.params.id;
            if (!id) return new this.ApiError("INCORRECT_BODY").send(res);
            const request = await this.driverService.getDriverRequestByIdForDispatch(id);
            if (!request) return new this.ApiError("DRIVER_REQUEST_NOT_FOUND").send(res);
            return res.json({ code: 200, message: null, driverRequest: request });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** Reject a driver request (reason required). */
    public async rejectDriverRequest(req: ValidatedRequest<RejectDriverRequestData>, res: Response) {
        try {
            const id = req.params.id;
            if (!id) return new this.ApiError("INCORRECT_BODY").send(res);
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);
            const { rejectedReason } = req.validatedBody!;
            await this.driverService.rejectDriverRequest(id, rejectedReason);
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "DRIVER_REQUEST_NOT_FOUND")
                    return new this.ApiError("DRIVER_REQUEST_NOT_FOUND").send(res);
                if (e.message === "DRIVER_REQUEST_NOT_PENDING")
                    return new this.ApiError("DRIVER_REQUEST_NOT_PENDING").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** Remove a rejected driver request so the user can submit a new one. */
    public async removeDriverRequest(req: Request, res: Response) {
        try {
            const id = req.params.id;
            if (!id) return new this.ApiError("INCORRECT_BODY").send(res);
            await this.driverService.removeDriverRequest(id);
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "DRIVER_REQUEST_NOT_FOUND")
                    return new this.ApiError("DRIVER_REQUEST_NOT_FOUND").send(res);
                if (e.message === "DRIVER_REQUEST_NOT_REJECTED")
                    return new this.ApiError("DRIVER_REQUEST_NOT_REJECTED").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** List active car types (for accept-driver modal). */
    public async getCarTypes(req: Request, res: Response) {
        try {
            const carTypes = await this.driverService.getActiveCarTypesForDispatch();
            return res.json({ code: 200, message: null, carTypes });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** Accept a PENDING driver request: create driver profile with carTypeId and set user role to DRIVER. */
    public async acceptDriverRequest(req: ValidatedRequest<AcceptDriverRequestData>, res: Response) {
        try {
            const id = req.params.id;
            if (!id) return new this.ApiError("INCORRECT_BODY").send(res);
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);
            const { carTypeId } = req.validatedBody!;
            await this.driverService.acceptDriverRequest(id, carTypeId);
            return res.status(204).send();
        } catch (e) {
            this.logger.error(e);
            if (e instanceof Error) {
                if (e.message === "DRIVER_REQUEST_NOT_FOUND")
                    return new this.ApiError("DRIVER_REQUEST_NOT_FOUND").send(res);
                if (e.message === "DRIVER_REQUEST_NOT_PENDING")
                    return new this.ApiError("DRIVER_REQUEST_NOT_PENDING").send(res);
                if (e.message === "USER_ALREADY_DRIVER")
                    return new this.ApiError("USER_ALREADY_DRIVER").send(res);
                if (e.message === "CAR_TYPE_NOT_FOUND_OR_INACTIVE")
                    return new this.ApiError("CAR_TYPE_NOT_FOUND_OR_INACTIVE").send(res);
            }
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }
}
