import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Standaard CarTypes: Comfort en Van met reserveringsopties. */
const CAR_TYPES = [
  {
    id: "10000000000000001",
    name: "Comfort",
    description: "Comfort personenauto, reserveringstarief.",
    imageUrl: "/images/car.svg",
    seats: 4,
    luggage: 2,
    baseFare: 4.31,
    pricePerKm: 2.5,
    pricePerMin: 0.52,
    minimumReservationFare: 25,
    shortReservationKm: 7,
    longRideNoTimeKm: 15,
    isActive: true,
  },
  {
    id: "10000000000000002",
    name: "Van",
    description: "Van / taxibusje, hoger reserveringstarief.",
    imageUrl: "/images/van.svg",
    seats: 8,
    luggage: 4,
    baseFare: 8.77,
    pricePerKm: 3,
    pricePerMin: 0.65,
    minimumReservationFare: 30,
    shortReservationKm: 7,
    longRideNoTimeKm: 15,
    isActive: true,
  },
];

async function main() {
  for (const carType of CAR_TYPES) {
    await prisma.carType.upsert({
      where: { id: carType.id },
      update: {
        name: carType.name,
        description: carType.description,
        imageUrl: carType.imageUrl,
        seats: carType.seats,
        luggage: carType.luggage,
        baseFare: carType.baseFare,
        pricePerKm: carType.pricePerKm,
        pricePerMin: carType.pricePerMin,
        minimumReservationFare: carType.minimumReservationFare,
        shortReservationKm: carType.shortReservationKm,
        longRideNoTimeKm: carType.longRideNoTimeKm,
        isActive: carType.isActive,
      },
      create: carType,
    });
  }
  console.log("Seed: CarTypes (Comfort, Van) upserted.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
