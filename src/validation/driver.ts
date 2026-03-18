import { DriverStatus } from "@prisma/client";
import z from "zod";

export const LOCATION_MAX_AGE_MS = 30_000; // 30 seconds
export const LOCATION_JUMP_MAX_KM = 10; // 10 km
export const LOCATION_JUMP_MAX_TIME_MS = 120_000; // 2 minutes

/** Alleen DB-write doen na deze interval (ms) of na min. afstand → minder writes bij stilstaande driver */
export const LOCATION_DB_WRITE_INTERVAL_MS = 15_000; // 15 seconds
export const LOCATION_DB_WRITE_MIN_DISTANCE_KM = 0.05; // 50 meters

export const driverLocationValidationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).optional(),
    timestamp: z.number().int().positive().refine(
        (ts) => ts <= Date.now() + 5000,
        "Timestamp cannot be in the future"
    ),
});

export type DriverLocationData = z.infer<typeof driverLocationValidationSchema>;

/** Only these can be set by the driver app; ON_BOOKING is set by the system. Uses Prisma enum so renames stay in sync. */
const DRIVER_APP_STATUSES = [DriverStatus.OFFLINE, DriverStatus.AVAILABLE, DriverStatus.ON_BOOKING] as const;

export const driverStatusValidationSchema = z.object({
    status: z.enum(DRIVER_APP_STATUSES),
});

export type DriverStatusData = z.infer<typeof driverStatusValidationSchema>;

export const acceptOfferValidationSchema = z.object({
    queueId: z.string().min(1, "queueId is required"),
});

export type AcceptOfferData = z.infer<typeof acceptOfferValidationSchema>;

export const declineOfferValidationSchema = z.object({
    queueId: z.string().min(1, "queueId is required"),
});

export type DeclineOfferData = z.infer<typeof declineOfferValidationSchema>;

const DRIVER_DISPATCH_STATUSES = ["ON_THE_WAY", "ARRIVED", "STARTED", "COMPLETED"] as const;

export const dispatchStatusValidationSchema = z.object({
    dispatchStatus: z.enum(DRIVER_DISPATCH_STATUSES),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
}).refine(
    (data) =>
        (data.latitude == null && data.longitude == null) ||
        (data.latitude != null && data.longitude != null),
    { message: "latitude and longitude must be provided together or omitted together" }
);

export type DispatchStatusData = z.infer<typeof dispatchStatusValidationSchema>;

/** Optional location when updating dispatch status; stored on the tracking event (e.g. where driver arrived/started/completed). */
export type DispatchStatusLocation = Pick<DispatchStatusData, "latitude" | "longitude">;

// --- Driver request validation (aligned with client validation/driverRequest.ts) ---

const normalizeNoSpaces = (s: string) => s.trim().replace(/\s/g, "");
const dutchPostcodeRegex = /^[0-9]{4}\s?[A-Za-z]{2}$/i;
const vatRegex = /^[A-Z]{2}[A-Z0-9]{8,12}$/;
const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const registrationNumberRegex = /^[0-9]{6,12}$/;

function isValidIbanChecksum(iban: string): boolean {
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let numeric = "";
    for (const c of rearranged) {
        numeric += /\d/.test(c) ? c : String(c.charCodeAt(0) - 55);
    }
    let remainder = 0;
    for (let i = 0; i < numeric.length; i++) {
        remainder = (remainder * 10 + parseInt(numeric[i], 10)) % 97;
    }
    return remainder === 1;
}

/** Body for submitting a driver application (create DriverRequest). Same rules as frontend. */
export const driverRequestValidationSchema = z.object({
    companyName: z
        .string()
        .min(1, "Company name is required")
        .max(200, "Company name is too long")
        .transform((s) => s.trim()),
    companyAddress: z
        .string()
        .min(1, "Address is required")
        .max(300, "Address is too long")
        .transform((s) => s.trim()),
    companyCity: z
        .string()
        .min(1, "City is required")
        .max(100, "City is too long")
        .transform((s) => s.trim()),
    companyPostcode: z
        .string()
        .min(1, "Postcode is required")
        .transform((s) => s.trim().toUpperCase())
        .refine((s) => dutchPostcodeRegex.test(s), "Use format 1234 AB"),
    registrationNumber: z
        .string()
        .min(1, "Registration number is required for invoicing")
        .transform((s) => s.replace(/\s/g, ""))
        .refine((s) => registrationNumberRegex.test(s), "Use 6–12 digits (e.g. KvK number)"),
    vatNumber: z
        .string()
        .min(1, "VAT number is required for invoicing")
        .transform((s) => normalizeNoSpaces(s).toUpperCase())
        .refine((s) => vatRegex.test(s), "Use a valid EU VAT number (e.g. NL123456789B01)"),
    bankAccountHolder: z
        .string()
        .min(1, "Account holder name is required")
        .max(200, "Account holder name is too long")
        .transform((s) => s.trim()),
    iban: z
        .string()
        .min(1, "IBAN is required")
        .transform((s) => normalizeNoSpaces(s).toUpperCase())
        .refine((s) => s.length >= 15 && s.length <= 34, "IBAN must be 15–34 characters")
        .refine((s) => ibanRegex.test(s), "Use a valid IBAN (e.g. NL91ABNA0417164300)")
        .refine(isValidIbanChecksum, "IBAN check digits are invalid"),
    message: z
        .string()
        .max(500, "Message is too long")
        .optional()
        .transform((s) => (s == null || s === "" ? undefined : s.trim())),
});

export type DriverRequestData = z.infer<typeof driverRequestValidationSchema>;

