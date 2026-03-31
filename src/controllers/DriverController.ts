import { Request, Response } from "express";
import Controller from "./controller";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import {
    AcceptOfferData,
    DeclineOfferData,
    DispatchStatusData,
    DriverLocationData,
    DriverRequestData,
    DriverStatusData,
    LOCATION_DB_WRITE_INTERVAL_MS,
    LOCATION_DB_WRITE_MIN_DISTANCE_KM,
    LOCATION_JUMP_MAX_KM,
    LOCATION_JUMP_MAX_TIME_MS,
    LOCATION_MAX_AGE_MS,
} from "@/validation/driver";
import { Prisma } from "@prisma/client";

import UserService from "@/services/UserService";
import { DispatchStatus, DriverStatus, QueueStatus } from "@prisma/client";
import DriverService from "@/services/DriverService";
import LocationService from "@/services/LocationService";
import { emitDriverLocation } from "@/socket";
import { sendDriverOnTheWayEmail } from "@/emails";
import config from "@/config";

type UserWithDriver = Prisma.UserGetPayload<{ include: { Driver: true } }>;

/** Driver with optional location fields (schema has locationUpdatedAt). */
type DriverWithLocation = { locationLat: number | null; locationLng: number | null; locationUpdatedAt?: Date | null };

export default class DriverController extends Controller {
    private userService: UserService = new UserService();
    private driverService: DriverService = new DriverService();
    private locationService: LocationService = new LocationService();

    public async getStatus(req: Request, res: Response) {
        try {
            const user = await this.userService.find({
                where: { id: (req as any).tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!user || !user.Driver || user.Driver.length === 0) {
                return new this.ApiError("NO_AUTHENTICATION").send(res);
            }

            return res.json({ status: user.Driver[0]?.status ?? DriverStatus.OFFLINE });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async postLocation(req: ValidatedRequest<DriverLocationData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const user = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!user || !user.Driver || user.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const data = req.validatedBody!;

            if ((Date.now() - data.timestamp) > LOCATION_MAX_AGE_MS) {
                return new this.ApiError("LOCATION_TOO_OLD").send(res);
            }

            const driver = user.Driver[0] as DriverWithLocation;
            if (
                driver.locationLat != null &&
                driver.locationLng != null &&
                driver.locationUpdatedAt != null
            ) {
                const distKm = this.locationService.calculateDistanceKm(
                    driver.locationLat,
                    driver.locationLng,
                    data.latitude,
                    data.longitude
                );
                const timeSinceLastUpdate = Date.now() - new Date(driver.locationUpdatedAt).getTime();
                if (distKm > LOCATION_JUMP_MAX_KM && timeSinceLastUpdate < LOCATION_JUMP_MAX_TIME_MS) {
                    return new this.ApiError("LOCATION_JUMP_INVALID").send(res);
                }
            }

            const bookingIds = await this.driverService.getActiveTrackingBookingIds(user.id);
            for (const bookingId of bookingIds) {
                emitDriverLocation(bookingId, {
                    lat: data.latitude,
                    lng: data.longitude,
                    timestamp: data.timestamp ?? Date.now(),
                });
            }

            const shouldWriteDb =
                driver.locationUpdatedAt == null ||
                driver.locationLat == null ||
                driver.locationLng == null ||
                Date.now() - new Date(driver.locationUpdatedAt).getTime() >= LOCATION_DB_WRITE_INTERVAL_MS ||
                this.locationService.calculateDistanceKm(
                    driver.locationLat,
                    driver.locationLng,
                    data.latitude,
                    data.longitude
                ) >= LOCATION_DB_WRITE_MIN_DISTANCE_KM;

            if (shouldWriteDb) {
                await this.driverService.updateLocation(user.id, data);
            }

            return res.json({ success: true });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async patchStatus(req: ValidatedRequest<DriverStatusData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const user = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!user || !user.Driver || user.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const data = req.validatedBody!;
            await this.driverService.updateStatus(user.id, data);

            return res.json({ success: true });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async getOffers(req: Request, res: Response) {

        try {
            const driver = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true }
            }) as UserWithDriver | null;

            if (!driver || !driver.Driver || driver.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const offers = await this.driverService.fetchOffers({
                where: {
                    driverId: driver.id,
                    status: QueueStatus.PENDING,
                    booking: {
                        dispatchStatus: DispatchStatus.OFFERING
                    }
                },
                include: {
                    booking: {
                        include: {
                            CarType: { select: { name: true } }
                        }
                    }
                }
            })

            return res.json({
                valid: true,
                offers
            })

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async acceptOffer(req: ValidatedRequest<AcceptOfferData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const driver = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!driver || !driver.Driver || driver.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const { queueId } = req.validatedBody!;
            const driverId = driver.id;

            const result = await this.driverService.acceptOffer(queueId, driverId);
            return res.json({ success: true, bookingId: result.bookingId });
        } catch (e: unknown) {
            if (e instanceof Error && e.message === "OFFER_NOT_FOUND_OR_ALREADY_RESPONDED") {
                return new this.ApiError("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED").send(res);
            }
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async declineOffer(req: ValidatedRequest<DeclineOfferData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const driver = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!driver || !driver.Driver || driver.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const { queueId } = req.validatedBody!;
            const driverId = driver.id;

            await this.driverService.declineOffer(queueId, driverId);
            return res.json({ success: true });
        } catch (e: unknown) {
            if (e instanceof Error && e.message === "OFFER_NOT_FOUND_OR_ALREADY_RESPONDED") {
                return new this.ApiError("OFFER_NOT_FOUND_OR_ALREADY_RESPONDED").send(res);
            }
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async getBookings(req: Request, res: Response) {
        try {
            const user = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!user || !user.Driver || user.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const filter = (req.query.filter as string) === "all" ? "all" : "upcoming";
            const bookings = await this.driverService.fetchDriverBookings(user.id, filter);

            return res.json({ bookings });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async patchDispatchStatus(req: ValidatedRequest<DispatchStatusData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const user = await this.userService.find({
                where: { id: req.tokens?.authorization?.payload?.id },
                include: { Driver: true },
                omit: { password: true },
            }) as UserWithDriver | null;

            if (!user || !user.Driver || user.Driver.length === 0) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const bookingId = req.params.id;
            if (!bookingId) return new this.ApiError("MISSING_BOOKING_ID").send(res);

            const { dispatchStatus, latitude, longitude } = req.validatedBody!;
            const newStatus = dispatchStatus as DispatchStatus;
            const location =
                latitude != null && longitude != null ? { latitude, longitude } : undefined;

            await this.driverService.updateBookingDispatchStatus(bookingId, user.id, newStatus, location);

            if (newStatus === DispatchStatus.ON_THE_WAY) {
                await this.driverService.setDriverOnBookingIfRideStillActive(user.id, bookingId);
                const bookingWithUser = await this.driverService.getBookingWithUser(bookingId, user.id);
                if (bookingWithUser?.user?.email) {
                    const trackUrl = `${config.app.url}/track/${bookingId}`;
                    sendDriverOnTheWayEmail(bookingWithUser.user.email, trackUrl)
                        .then((result) => {
                            if (result?.error) this.logger.error("Driver on the way email failed", { error: result.error });
                        })
                        .catch((err) =>
                            this.logger.error("Driver on the way email error", { err: err instanceof Error ? err.message : String(err) })
                        );
                }
            }

            if (newStatus === DispatchStatus.COMPLETED) {
                await this.driverService.completeBooking(bookingId, user.id);
            }

            return res.json({ success: true });
        } catch (e: unknown) {
            if (e instanceof Error) {
                if (e.message === "BOOKING_NOT_FOUND_OR_NOT_ASSIGNED")
                    return new this.ApiError("BOOKING_NOT_FOUND_OR_NOT_ASSIGNED").send(res);
                if (e.message === "INVALID_DISPATCH_STATUS_TRANSITION")
                    return new this.ApiError("INVALID_DISPATCH_STATUS_TRANSITION").send(res);
            }
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** Get current user's driver request (if any). */
    public async getMyRequest(req: Request, res: Response) {
        try {
            const userId = req.tokens?.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const request = await this.driverService.getMyDriverRequest(userId);
            return res.json({ request: request ?? null });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    /** Create driver application request (any authenticated user, no DRIVER role required). One per user. */
    public async createRequest(req: ValidatedRequest<DriverRequestData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens?.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const existing = await this.driverService.getMyDriverRequest(userId);
            if (existing) {
                return res.status(409).json({
                    error: "DRIVER_REQUEST_ALREADY_SUBMITTED",
                    message: "You have already submitted a driver application.",
                    status: existing.status as string,
                });
            }

            const data = req.validatedBody!;
            await this.driverService.createDriverRequest(userId, data);

            return res.status(201).json({
                success: true,
                message: "Driver request submitted successfully.",
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }
}