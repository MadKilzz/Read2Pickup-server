import z from "zod";

export const locationSearchValidationSchema = z.object({
    q: z.string().min(1, "Query is required"),
    intent: z.enum(["pickup", "dropoff"]).optional()
});

export type LocationSearchData = z.infer<typeof locationSearchValidationSchema>;

export const locationResolveValidationSchema = z.object({
    id: z.string().min(1, "Location ID is required"),
    intent: z.enum(["pickup", "dropoff"]).optional()
});

export type LocationResolveData = z.infer<typeof locationResolveValidationSchema>;

export const bookingDraftValidationSchema = z.object({
    startLocationId: z.string().min(1, "Start location is required"),
    endLocationId: z.string().min(1, "End location is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
});

export type BookingDraftData = z.infer<typeof bookingDraftValidationSchema>;