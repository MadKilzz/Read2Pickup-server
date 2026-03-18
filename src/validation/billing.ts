import z from "zod";

export const snowflakeId = z
    .string()
    .regex(/^\d{6,20}$/, "Invalid Snowflake ID format");

export const CreatePaySessionValidationSchema = z.object({
    draftId: z.string().regex(/^\d{17,19}$/, "Invalid Snowflake ID format")
})

export type CreatePaySessionData = z.infer<typeof CreatePaySessionValidationSchema>;

export const BillingAddressValidationSchema = z.object({
    street: z.string().min(1, "Street address is required."),
    city: z.string().min(1, "City is required."),
    postalCode: z.string().min(1, "Postal code is required."),
    country: z.string().min(1, "Country is required."),
    state: z.string().optional(),
});

export type BillingAddressData = z.infer<typeof BillingAddressValidationSchema>;

const vatNumberSchema = z
    .string()
    .trim()
    .max(50)
    .refine(
        (val) => !val || /^[A-Za-z]{2}[0-9A-Za-z]{8,20}$/i.test(val),
        "VAT number must start with 2 letters (country code) followed by 8–20 digits or letters (e.g. BE0123456789)."
    )
    .optional();

export const CreateCompanyProfileValidationSchema = z.object({
    label: z.string().trim().min(1, "Label is required.").max(100, "Label cannot exceed 100 characters."),
    companyName: z.string().trim().min(1, "Company name is required.").max(200),
    vatNumber: vatNumberSchema,
    street: z.string().trim().min(1, "Street address is required.").max(200),
    city: z.string().trim().min(1, "City is required.").max(100),
    postalCode: z.string().trim().min(1, "Postal code is required.").max(20),
    country: z.string().trim().min(1, "Country is required.").max(100),
    state: z.string().trim().max(100).optional(),
    isDefault: z.boolean().optional(),
});

export type CreateCompanyProfileData = z.infer<typeof CreateCompanyProfileValidationSchema>;

export const UpdateCompanyProfileValidationSchema = CreateCompanyProfileValidationSchema;
export type UpdateCompanyProfileData = z.infer<typeof UpdateCompanyProfileValidationSchema>;
