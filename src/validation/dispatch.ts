import z from "zod";

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

const DISPATCHER_DISPATCH_STATUSES = ["NO_SHOW", "CANCELED"] as const;

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
