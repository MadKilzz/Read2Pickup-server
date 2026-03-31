import z from "zod";
import { DispatchStatus, DriverRequestStatus } from "@prisma/client";

export const reassignValidationSchema = z.object({
    driverId: z.string().min(1, "driverId is required"),
});

export type ReassignData = z.infer<typeof reassignValidationSchema>;

export const offerToDriverValidationSchema = z.object({
    driverId: z.string().min(1, "driverId is required"),
});

export type OfferToDriverData = z.infer<typeof offerToDriverValidationSchema>;

export const cancelOfferValidationSchema = z.object({
    driverId: z.string().min(1, "driverId is required"),
});

export type CancelOfferData = z.infer<typeof cancelOfferValidationSchema>;

/** Dispatcher may not set CANCELED; only the passenger cancels via customer API. */
const DISPATCHER_DISPATCH_STATUSES = ["NO_SHOW"] as const;

export const dispatcherDispatchStatusValidationSchema = z.object({
    dispatchStatus: z.enum(DISPATCHER_DISPATCH_STATUSES),
});

export type DispatcherDispatchStatusData = z.infer<typeof dispatcherDispatchStatusValidationSchema>;

export const rejectDriverRequestValidationSchema = z.object({
    rejectedReason: z.string().min(1, "Reason is required").max(500, "Reason cannot exceed 500 characters"),
});

export type RejectDriverRequestData = z.infer<typeof rejectDriverRequestValidationSchema>;

export const acceptDriverRequestValidationSchema = z.object({
    carTypeId: z.string().min(1, "Car type is required"),
});

export type AcceptDriverRequestData = z.infer<typeof acceptDriverRequestValidationSchema>;

export const dispatchDriversQueryValidationSchema = z.object({
    bookingId: z.string().min(1, "bookingId is required"),
    availableOnly: z.enum(["true", "false"]).optional(),
    search: z.string().optional(),
    mode: z.enum(["default", "nearest"]).optional(),
    limit: z.coerce.number().int().min(1).max(25).optional(),
});

export type DispatchDriversQueryData = z.infer<typeof dispatchDriversQueryValidationSchema>;

export const dispatchBookingsQueryValidationSchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    date: z.string().optional(),
    dispatchStatus: z.nativeEnum(DispatchStatus).optional(),
});

export type DispatchBookingsQueryData = z.infer<typeof dispatchBookingsQueryValidationSchema>;

export const dispatchDriverRequestsQueryValidationSchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
    search: z.string().optional(),
    status: z.nativeEnum(DriverRequestStatus).optional(),
});

export type DispatchDriverRequestsQueryData = z.infer<typeof dispatchDriverRequestsQueryValidationSchema>;
