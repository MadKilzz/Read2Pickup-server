import { Prisma } from "@prisma/client";

export type BookingWithUserAndCartype = Prisma.BookingGetPayload<{
    include: {
        user: true,
        CarType: true
    };
}>;