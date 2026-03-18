import { GENDER } from "@prisma/client";
import { z } from "zod";
import config from "@/config";

// Helper functie
export const isValidPhoneNumber = (phone: string): boolean => {
    // Optionele "+" aan het begin, daarna 7-15 cijfers
    const regex = /^\+?[0-9]{7,15}$/;
    return regex.test(phone);
};

export const snowflakeId = z
    .string()
    .regex(/^\d{17,19}$/, { error: "Invalid Snowflake ID format" });

// Register validation schema
export const RegisterValidationSchema = z.object({
    email: z.string().email("Please enter a valid email address."),
    firstname: z.string()
        .min(2, "First name must be at least 2 characters long.")
        .max(50, "First name must be at most 50 characters."),
    lastname: z.string()
        .min(2, "Last name must be at least 2 characters long.")
        .max(50, "Last name must be at most 50 characters."),
    password: z.string()
        .min(8, "Password must be at least 8 characters."),
    phone: z.string()
        .refine(isValidPhoneNumber, "Phone number must contain only digits and can include an optional '+' prefix. 7–15 digits allowed."),
    gender: z.enum([GENDER.MALE, GENDER.FEMALE, GENDER.OTHER, GENDER.PREFER_NOT_TO_SAY], {
        message: "Please select a valid gender option."
    })
});

export type RegisterData = z.infer<typeof RegisterValidationSchema>;

// OTP validation schema
export const OtpValidationSchema = z.object({
    email: z.string().email("Please enter a valid email address."),
    otp: z.string()
        .regex(/^[0-9]{6}$/, { error: "OTP must be at least 6 digits." })
});

export type OtpData = z.infer<typeof OtpValidationSchema>;

export const LoginValidationSchema = z.object({
    email: z.string().email("Invalid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    deviceToken: z.string().min(1).optional(),
    platform: z.enum(["ios", "android"]).optional(),
});

export type LoginData = z.infer<typeof LoginValidationSchema>;

export const BookingDraftValidationSchema = z.object({
    userId: z.string().optional(),

    from: z.object({
        id: z.string(),
        addressLine1: z.string().min(1, "Pickup address is required."),
        addressLine2: z.string().optional(),
        lat: z.number().min(-90, "Invalid latitude.").max(90, "Invalid latitude."),
        lng: z.number().min(-180, "Invalid longitude.").max(180, "Invalid longitude."),
    }),

    to: z.object({
        id: z.string(),
        addressLine1: z.string().min(1, "Drop-off address is required."),
        addressLine2: z.string().optional(),
        lat: z.number().min(-90, "Invalid latitude.").max(90, "Invalid latitude."),
        lng: z.number().min(-180, "Invalid longitude.").max(180, "Invalid longitude."),
    }),

    pickupDateTime: z.preprocess(
        (val) => (typeof val === "string" || val instanceof Date ? new Date(val) : val),
        z.date({ message: "Pickup date & time is required" }) // werkt altijd
    ).refine(
        (date) => !!date && date.getTime() >= Date.now() + config.booking.minHoursAhead * 60 * 60 * 1000,
        { message: `Pickup time must be at least ${config.booking.minHoursAhead} hour(s) from now` }
    )
})

export type BookingDraftData = z.infer<typeof BookingDraftValidationSchema>;

export const PatchDraftValidationSchema = z.object({
    carTypeId: snowflakeId.optional(),
    userId: snowflakeId.optional(),
    flightNumber: z
        .string()
        .optional()
        .refine(
            (val) => !val || /^[A-Z]{2,3}\d{1,4}$/.test(val.toUpperCase()),
            { message: "Invalid flight number format" }
        )
        .transform((val) => val?.toUpperCase()),
    notes: z.string().trim().max(500, "Notes cannot exceed 500 characters").optional(),
    bookingType: z.enum(["personal", "business"]).optional(),
    companyProfileId: snowflakeId.optional().nullable(),
}).refine(
    (data) => Object.values(data).some(val => val !== undefined),
    { message: "At least one field must be provided to update the draft" }
);

export type PatchDraftData = z.infer<typeof PatchDraftValidationSchema>;


export const cancelBookingValidationSchema = z.object({
    id: z.string()
        .regex(/^\d{18,19}$/, { error: "Invalid booking ID" })
});

export type CancelBookingData = z.infer<typeof cancelBookingValidationSchema>;

export const rebookValidationSchema = z.object({
    pickupDateTime: z
        .string()
        .min(1, "Pickup date & time is required")
        .transform((val) => new Date(val))
        .refine(
            (date) => !isNaN(date.getTime()) && date.getTime() >= Date.now() + config.booking.minHoursAhead * 60 * 60 * 1000,
            { message: `Pickup time must be at least ${config.booking.minHoursAhead} hour(s) from now` }
        ),
});

export type RebookData = z.infer<typeof rebookValidationSchema>;

export const patchBookingValidationSchema = z.object({
    notes: z.string().trim().max(500, "Notes cannot exceed 500 characters"),
    flightNumber: z
        .string()
        .trim()
        .optional()
        .refine(
            (val) => !val || val === "" || /^[A-Z]{2,3}\d{1,4}$/i.test(val),
            { message: "Invalid flight number format" }
        )
        .transform((val) => (val && val.length ? val.toUpperCase() : null))
});

export type PatchBookingNotesData = z.infer<typeof patchBookingValidationSchema>;

// Change password validation schema
export const ChangePasswordValidationSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
});

export type ChangePasswordData = z.infer<typeof ChangePasswordValidationSchema>;


export const UpdateProfileValidationSchema = z.object({
    firstname: z.string().min(2, "First name must be at least 2 characters long.").max(50, "First name must be at most 50 characters."),
    lastname: z.string().min(2, "Last name must be at least 2 characters long.").max(50, "Last name must be at most 50 characters."),
    phone: z.string().optional(), // display only, not validated on submit
});

export type UpdateProfileData = z.infer<typeof UpdateProfileValidationSchema>;
