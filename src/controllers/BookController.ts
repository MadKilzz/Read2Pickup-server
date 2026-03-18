import { Request, Response } from "express";
import Controller from "./controller";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import { BookingDraftData, CancelBookingData, LoginData, OtpData, PatchBookingNotesData, PatchDraftData, RebookData, RegisterData, RegisterValidationSchema } from "@/validation/auth";

import UserService from "@/services/UserService";
import BookService from "@/services/BookService";
import CompanyProfileService from "@/services/CompanyProfileService";
import { BookingStatus, DispatchStatus, DraftStatus } from "@prisma/client";
import BillingService from "@/services/BillingService";
import InvoiceService from "@/services/InvoiceService";
import LocationService from "@/services/LocationService";
import { sendConfirmCancelBookingEmail } from "@/emails";
import config from "@/config";
import { formatBookingDateTime } from "@/utils/date";
import { BookingWithUserAndCartype } from "@/types/booking.types";
import SlackService from "@/services/SlackService";

export default class BookController extends Controller {
    private userService: UserService = new UserService();
    private billingService: BillingService = new BillingService();
    private invoiceService: InvoiceService = new InvoiceService();
    private bookService: BookService = new BookService();
    private companyProfileService: CompanyProfileService = new CompanyProfileService();
    private locationService: LocationService = new LocationService();
    private slackService: SlackService = new SlackService();

    public async getBooking(req: Request, res: Response) {
        try {

            const user = await this.userService.find({
                where: { id: req.tokens.authorization.payload?.id }
            });

            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            const id = req.params.id;

            const booking = await this.bookService.fetchBooking({
                where: {
                    id: id,
                    userId: user.id
                },
                select: {
                    id: true,
                    startAddress: true,
                    endAddress: true,
                    bookingTime: true,
                    status: true,
                    price: true,
                    flightNumber: true,
                    notes: true,
                    distanceMeters: true,
                    durationSeconds: true,
                    paymentIntentId: true,
                    refundId: true,
                    refundedAt: true,
                    CarType: {
                        select: {
                            name: true,
                            description: true,
                            seats: true,
                            luggage: true,
                            imageUrl: true
                        }
                    }
                }
            });

            if (!booking) return new this.ApiError('BOOKING_NOT_FOUND').send(res);

            const payment = booking.paymentIntentId ? await this.billingService.getPaymentInfo(booking.paymentIntentId) : null;

            return res.json({
                ...booking,
                payment
            })

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async getBookingInvoice(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization?.payload?.id;
            if (!userId) return new this.ApiError("USER_NOT_FOUND").send(res);

            const id = req.params.id;
            if (!id) return new this.ApiError("MISSING_BOOKING_ID").send(res);

            const booking = await this.bookService.fetchBooking({
                where: {
                    id,
                    userId,
                    status: BookingStatus.COMPLETED,
                },
                select: {
                    id: true,
                    startAddress: true,
                    endAddress: true,
                    bookingTime: true,
                    price: true,
                    companyName: true,
                    vatNumber: true,
                    billingAddress: true,
                    CarType: { select: { name: true } },
                    user: {
                        select: { firstname: true, lastname: true, email: true },
                    },
                },
            });

            if (!booking) return new this.ApiError("BOOKING_NOT_FOUND").send(res);
            const user = "user" in booking && booking.user ? booking.user : null;
            if (!user || typeof user !== "object" || !("firstname" in user)) return new this.ApiError("BOOKING_NOT_FOUND").send(res);

            const pdfBuffer = await this.invoiceService.buildInvoicePdf(
                booking as unknown as Parameters<InvoiceService["buildInvoicePdf"]>[0],
                user as Parameters<InvoiceService["buildInvoicePdf"]>[1]
            );
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="invoice-${booking.id}.pdf"`);
            return res.send(pdfBuffer);
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async rebookBooking(req: ValidatedRequest<RebookData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError('USER_NOT_FOUND').send(res);

            const bookingId = req.params.id;
            if (!bookingId) return new this.ApiError('MISSING_BOOKING_ID').send(res);

            const { pickupDateTime } = req.validatedBody!;

            const booking = await this.bookService.fetchBooking({
                where: { id: bookingId, userId },
                select: {
                    id: true,
                    status: true,
                    startAddress: true,
                    startLat: true,
                    startLng: true,
                    endAddress: true,
                    endLat: true,
                    endLng: true,
                    distanceMeters: true,
                    durationSeconds: true,
                    carTypeId: true,
                },
            });

            if (!booking) return new this.ApiError('BOOKING_NOT_FOUND').send(res);
            if (booking.status !== BookingStatus.COMPLETED) return new this.ApiError('BOOKING_NOT_COMPLETED').send(res);

            const draftId = this.SnowFlake.generate();
            const now = new Date();

            const draft = await this.bookService.draft({
                data: {
                    id: draftId,
                    userId,
                    startAddress: booking.startAddress,
                    startLat: booking.startLat,
                    startLng: booking.startLng,
                    endAddress: booking.endAddress,
                    endLat: booking.endLat,
                    endLng: booking.endLng,
                    distanceMeters: booking.distanceMeters,
                    durationSeconds: booking.durationSeconds,
                    carTypeId: booking.carTypeId,
                    bookingTime: pickupDateTime,
                    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                },
            });

            if (!draft) return new this.ApiError('UNKNOWN_ERROR').send(res);

            return res.json({
                code: 200,
                message: 'Draft created for rebook.',
                data: { id: draft.id },
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async getBookingSummary(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError('USER_NOT_FOUND').send(res);

            const user = await this.userService.find({ where: { id: userId } });
            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            const now = new Date();
            const gracePeriod = new Date(Date.now() - 5 * 60 * 1000);

            const [upcoming, past, canceled] = await Promise.all([
                this.bookService.fetchBookingCount({
                    where: { userId, bookingTime: { gte: now }, status: { not: BookingStatus.CANCELED } }
                }),
                this.bookService.fetchBookingCount({
                    where: { userId, bookingTime: { lte: gracePeriod }, status: BookingStatus.COMPLETED }
                }),
                this.bookService.fetchBookingCount({
                    where: { userId, status: BookingStatus.CANCELED }
                }),
            ]);

            return res.json({ code: 200, counts: { upcoming, past, canceled } });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async getBookings(req: Request, res: Response) {
        try {
            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError('USER_NOT_FOUND').send(res);

            const user = await this.userService.find({ where: { id: userId } });
            if (!user) return new this.ApiError('USER_NOT_FOUND').send(res);

            // Pagination
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            // Filters from query
            const { status, carType, search } = req.query as {
                status?: string
                carType?: string
                search?: string
            };

            // Build Prisma where clause dynamically
            const where: any = { userId };

            if (status) where.status = status.toUpperCase();
            if (carType) where.CarType = { name: carType };
            if (search) {
                where.OR = [
                    { id: { contains: search, mode: 'insensitive' } },
                    { startAddress: { contains: search, mode: 'insensitive' } },
                    { endAddress: { contains: search, mode: 'insensitive' } },
                ];
            }

            // Total count for pagination
            const totalCount = await this.bookService.fetchBookingCount({ where });
            const totalPages = Math.ceil(totalCount / limit);

            // Fetch bookings
            const bookings = await this.bookService.fetchBookings({
                where,
                select: {
                    id: true,
                    startAddress: true,
                    endAddress: true,
                    bookingTime: true,
                    status: true,
                    price: true,
                    flightNumber: true,
                    notes: true,
                    CarType: { select: { name: true } },
                },
                orderBy: { bookingTime: 'asc' },
                skip,
                take: limit,
            });

            return res.json({
                code: 200,
                bookings,
                pagination: { page, limit, totalCount, totalPages },
            });
        } catch (error) {
            this.logger.error(error);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async cancelBooking(req: ValidatedRequest<CancelBookingData>, res: Response) {
        try {

            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const data: CancelBookingData = req.validatedBody!;
            
            const booking = await this.bookService.fetchBooking({
                where: { id: data.id, userId: req.tokens.authorization.payload?.id },
                include: { user: { select: { email: true, firstname: true, lastname: true, phone: true } } },
            }) as BookingWithUserAndCartype | null;

            if (!booking) return new this.ApiError('BOOKING_NOT_FOUND').send(res);

            if (booking.status === BookingStatus.CANCELED) return new this.ApiError('BOOKING_ALREADY_CANCELED').send(res);

            const now = new Date();
            const bookingTime = new Date(booking.bookingTime);
            const cancelDeadline = new Date(bookingTime.getTime() - 1000 * 60 * 60);

            const canCancel = now <= cancelDeadline;

            await this.bookService.cancelBookingAtomic(booking.id);

            if (canCancel && booking.paymentIntentId) {
                try {
                    const refund = await this.billingService.refundPayment(
                        booking.paymentIntentId,
                        booking.id
                    );

                    await this.bookService.updateBooking({
                        where: {
                            id: booking.id
                        },
                        data: {
                            refundId: refund.id,
                            refundedAt: new Date()
                        }
                    })
                } catch (error) {
                    this.logger.error(`Stripe Refund Failed for booking: #${booking.id}`)
                }
            }

            const isLate = !canCancel;
            const userEmail = booking.user?.email;

            const dispatchBookingUrl = `${config.dispatchAppUrl.replace(/\/$/, "")}/bookings/${booking.id}`;
            const bookingTimeFormatted = formatBookingDateTime(booking.bookingTime);
            const passengerName = [booking.user.firstname, booking.user.lastname].filter(Boolean).join(" ") || "—";
            const notesDisplay = booking.notes?.trim() || "N/A";
            const flightNumberDisplay = booking.flightNumber?.trim() || "N/A";

            const slackPayload = {
                bookingId: booking.id,
                passengerName,
                phone: booking.user.phone,
                startAddress: booking.startAddress,
                endAddress: booking.endAddress,
                bookingTimeFormatted,
                notesDisplay,
                flightNumberDisplay,
                carTypeName: booking.CarType?.name ?? "—",
                dispatchBookingUrl,
            };

            await this.slackService.sendCancelledBookingForDispatch(slackPayload).catch((err) => {
                this.logger.error("Failed to send cancelled booking to Slack", err);
            });


            if (userEmail && config.app.isProduction) {
                const amountCharged = isLate && booking.currency && booking.price != null
                    ? `${booking.currency === "EUR" ? "€" : booking.currency} ${Number(booking.price).toFixed(2)}`
                    : undefined;
                sendConfirmCancelBookingEmail(userEmail, {
                    isLate,
                    bookingTime: booking.bookingTime,
                    amountCharged,
                }).then((result) => {
                    if (result?.error) this.logger.error("Confirm cancel email failed", { error: result.error });
                }).catch((err) =>
                    this.logger.error("Confirm cancel email error", { err: err instanceof Error ? err.message : String(err) })
                );
            }

            return res.json({
                code: 200,
                message: "Booking canceled successfully.",
                data: {
                    isLate,
                },
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async draft(req: ValidatedRequest<BookingDraftData>, res: Response) {

        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const data: BookingDraftData = req.validatedBody!;

            const userId = req.tokens?.authorization?.payload?.id || null;
            const id = this.SnowFlake.generate();

            const fromLocation = await this.locationService.find({
                where: { placeId: data.from.id },
            });

            if (!fromLocation) return new this.ApiError('INVALID_LOCATION').send(res);
            if (fromLocation.lat == null || fromLocation.lng == null) return new this.ApiError('INVALID_LOCATION').send(res);

            if (!this.locationService.isWithinServiceArea(fromLocation.lat, fromLocation.lng)) return new this.ApiError('OUT_OF_SERVICE_AREA').send(res);

            const toLocation = await this.locationService.find({
                where: { placeId: data.to.id },
            });

            if (!toLocation) return new this.ApiError('INVALID_LOCATION').send(res);
            if (toLocation.lat == null || toLocation.lng == null) return new this.ApiError('INVALID_LOCATION').send(res);

            const formatAddress = (place: typeof fromLocation | typeof toLocation) =>
                [place.name, place.street, place.city, place.postal, place.country]
                    .filter(Boolean) // skip lege waarden
                    .join(", ");

            const routeData = await this.bookService.getRouteData(
                fromLocation.lat!, fromLocation.lng!,
                toLocation.lat!, toLocation.lng!
            );

            const draft = await this.bookService.draft({
                data: {
                    id,
                    ...(userId && { user: { connect: { id: userId } } }),
                    bookingTime: data.pickupDateTime,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    distanceMeters: routeData.distance.value,
                    durationSeconds: routeData.duration.value,

                    startAddress: formatAddress(fromLocation),
                    startLat: fromLocation.lat!,
                    startLng: fromLocation.lng!,

                    endAddress: formatAddress(toLocation),
                    endLat: toLocation.lat,
                    endLng: toLocation.lng,
                },
            });

            if (!draft) return new this.ApiError("UNKNOWN_ERROR").send(res);

            return res.json({
                code: 200,
                message: "Draft created successfully.",
                data: {
                    id: draft.id
                }
            })

            /*
            const { date, time, ...rest } = data;

            const userId = req.tokens?.authorization?.payload?.id || null;

            const id = this.SnowFlake.generate();

            const dateTime = this.bookService.combineDateTime(date, time);

            const routeData = this.bookService.getRouteData(
                data.from.lat, data.from.lng,
                data.to.lat, data.to.lng
            );

            const draft = await this.bookService.draft({
                data: {
                    id: id,
                    userId,
                    bookingTime: dateTime,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), //expire in 24 hours
                    distanceMeters: routeData.distance.value,
                    durationSeconds: routeData.duration.value,
                    ...rest

                }
            })

            if (!draft) return new this.ApiError('UNKNOWN_ERROR').send(res);

            

            return res.json({
                code: 200,
                message: "Draft created successfully.",
                data: {
                    id: draft.id
                }
            })
*/
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }

    }

    public async fetchDraft(req: ValidatedRequest<BookingDraftData>, res: Response) {
        try {
            const { id } = req.params;
            if (!id) return new this.ApiError("MISSING_DRAFT_ID").send(res);

            const minBookingTime = new Date(Date.now() + config.booking.minHoursAhead * 60 * 60 * 1000);
            const draft = await this.bookService.fetchDraft({
                where: {
                    id: id,
                    expiresAt: { gt: new Date() },
                    bookingTime: { gte: minBookingTime },
                    status: { notIn: [DraftStatus.EXPIRED, DraftStatus.PAID] },
                },
                include: {
                    user: {
                        select: {
                            email: true,
                            firstname: true,
                            lastname: true,
                            gender: true
                        }
                    }
                }
            })
            if (!draft) return new this.ApiError("DRAFT_NOT_FOUND").send(res);

            if (draft.userId && draft.userId !== req.tokens.authorization.payload?.id) return new this.ApiError("DRAFT_NOT_FOUND").send(res);

            const carTypes = await this.bookService.fetchCarTypes({
                where: {
                    isActive: true,
                }
            });

            const results = carTypes.map((carType) => {

                const price = this.bookService.calculateRidePrice(
                    {
                        distanceMeters: draft.distanceMeters,
                        baseFare: carType.baseFare,
                        pricePerKm: carType.pricePerKm,
                        pricePerMin: carType.pricePerMin,
                        durationSeconds: draft.durationSeconds,
                    },
                    {
                        minimumFareReservation: carType.minimumReservationFare,
                        shortReservationThresholdKm: carType.shortReservationKm,
                        longRideNoTimeThresholdKm: carType.longRideNoTimeKm,
                    }
                );

                return {
                    id: carType.id,
                    name: carType.name,
                    description: carType.description,
                    seats: carType.seats,
                    bags: carType.luggage,
                    imageUrl: carType.imageUrl, // https://static.blacklane.com/_next/static/images/business-ec6967ba05dce8d3ea62ba2c200da544.png
                    price,
                };
            });


            return res.json({
                code: 200,
                data: {
                    ...draft,
                    //distance: parseFloat((draft.distanceMeters / 1000).toFixed(1)),
                    distance: this.bookService.metersToKilometers(draft.distanceMeters),
                    duration: this.bookService.secondsToMinutes(draft.durationSeconds),
                    services_classes: results
                }
            })

        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }

    }

    public async patchDraft(req: ValidatedRequest<PatchDraftData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const { id } = req.params;
            if (!id) return new this.ApiError("MISSING_DRAFT_ID").send(res);

            const draft = await this.bookService.fetchDraft({ where: { id } });
            if (!draft) return new this.ApiError("DRAFT_NOT_FOUND").send(res);

            if (draft.status === DraftStatus.PAYMENT_IN_PROGRESS) return new this.ApiError("DRAFT_PAYMENT_IN_PROGRESS").send(res);

            const { userId, carTypeId, flightNumber, notes, bookingType, companyProfileId } = req.validatedBody!;

            if (userId) {
                const user = await this.userService.find({ where: { id: userId } });
                if (!user) return new this.ApiError("INCORRECT_BODY").send(res);

                if (draft.userId && draft.userId !== userId) return new this.ApiError("DRAFT_ALREADY_LINKED").send(res);
            }

            if (carTypeId) {
                const carType = await this.bookService.fetchCarType({ where: { id: carTypeId } });
                if (!carType) return new this.ApiError("INCORRECT_BODY").send(res);
            }

            if (companyProfileId) {
                const profileUserId = req.tokens?.authorization?.payload?.id;
                if (!profileUserId) return new this.ApiError("REQUEST_NOT_ALLOWED").send(res);

                const profile = await this.companyProfileService.findFirst({
                    where: { id: companyProfileId, userId: profileUserId },
                });
                if (!profile) return new this.ApiError("COMPANY_PROFILE_NOT_FOUND").send(res);
            }

            const updateData: {
                userId?: string;
                carTypeId?: string;
                flightNumber?: string;
                notes?: string;
                bookingType?: string;
                companyProfileId?: string | null;
            } = {
                userId,
                carTypeId,
                flightNumber: flightNumber === draft.flightNumber ? undefined : flightNumber,
                notes: notes === draft.notes ? undefined : notes,
                bookingType,
                companyProfileId: companyProfileId !== undefined ? companyProfileId : (bookingType === "personal" ? null : undefined),
            };

            const filteredData = Object.fromEntries(
                Object.entries(updateData).filter(([, v]) => v !== undefined)
            ) as Parameters<BookService["updateDraft"]>[0]["data"];

            const updatedDraft = await this.bookService.updateDraft({
                where: { id },
                data: filteredData,
            });

            if (!updatedDraft) return new this.ApiError('UNKNOWN_ERROR').send(res);

            return res.json({
                code: 200,
                message: "Draft updated successfully.",
                data: {
                    userId: updatedDraft.userId ?? userId,
                    carTypeId: updatedDraft.carTypeId ?? carTypeId,
                    flightNumber: updatedDraft.flightNumber ?? flightNumber,
                    notes: updatedDraft.notes ?? notes,
                    bookingType: updatedDraft.bookingType ?? bookingType,
                    companyProfileId: updatedDraft.companyProfileId ?? companyProfileId,
                }
            })
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    public async patchBooking(req: ValidatedRequest<PatchBookingNotesData>, res: Response) {
        try {
            if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

            const userId = req.tokens.authorization.payload?.id;
            if (!userId) return new this.ApiError('USER_NOT_FOUND').send(res);

            const { id } = req.params;
            if (!id) return new this.ApiError("MISSING_BOOKING_ID").send(res);

            const { notes, flightNumber } = req.validatedBody!;

            const booking = await this.bookService.fetchBooking({
                where: { id, userId }
            });

            if (!booking) return new this.ApiError('BOOKING_NOT_FOUND').send(res);
            if (booking.status === BookingStatus.CANCELED) return new this.ApiError('REQUEST_NOT_ALLOWED').send(res);

            const currentNotes = (booking.notes ?? "").trim();
            const newNotes = notes.trim();
            const currentFlight = (booking.flightNumber ?? "").trim();
            const newFlight = (flightNumber ?? "").trim();
            const hasChanges = currentNotes !== newNotes || currentFlight !== newFlight;

            if (hasChanges) {
                await this.bookService.updateBooking({
                    where: { id },
                    data: {
                        notes,
                        flightNumber: flightNumber ?? null
                    }
                });
            }

            return res.json({
                code: 200,
                message: "Details saved.",
                data: { notes, flightNumber: flightNumber ?? null }
            });
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError('UNKNOWN_ERROR').send(res);
        }
    }

    
}