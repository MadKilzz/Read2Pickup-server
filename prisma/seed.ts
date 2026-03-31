import { PrismaClient } from "@prisma/client";
import SnowFlake from "../src/utils/SnowFlake";

// `prisma/seed.ts` valt buiten de reguliere `tsconfig.json` include,
// waardoor TS-lints soms geen Node `process` types meenemen.
declare const process: {
  env: Record<string, string | undefined>;
  exit: (code?: number) => void;
};

const prisma = new PrismaClient();

type CarTypeSeed = Omit<
  Parameters<typeof prisma.carType.create>[0]["data"],
  "id"
> & { id?: never };

/** CarTypes: Standard en Van. `imageUrl` moet overeenkomen met `/classes/${imageUrl}` in de frontend. */
const CAR_TYPES: CarTypeSeed[] = [
  {
    name: "Standard",
    description: "Daily use - Volkswagen Passat or similar",
    imageUrl: "r2p-comfort-class.png",
    seats: 4,
    luggage: 3,
    pricePerKm: 2.5,
    pricePerMin: 0.52,
    baseFare: 4.31,
    minimumReservationFare: 25,
    shortReservationKm: 7,
    longRideNoTimeKm: 15,
    isActive: true,
  },
  {
    name: "Van",
    description: "Groups - Mercedes-Benz V-Class or similar",
    imageUrl: "r2p-van-class.png",
    seats: 7,
    luggage: 6,
    pricePerKm: 3,
    pricePerMin: 0.65,
    baseFare: 8.77,
    minimumReservationFare: 30,
    shortReservationKm: 7,
    longRideNoTimeKm: 15,
    isActive: true,
  },
];

async function seedCarTypes() {
  for (const carType of CAR_TYPES) {
    // `name` is not unique, so we use it only for idempotency (create if missing, update if present).
    const existing = await prisma.carType.findFirst({
      where: { name: carType.name },
    });

    if (existing) {
      await prisma.carType.update({
        where: { id: existing.id },
        data: carType,
      });
      continue;
    }

    await prisma.carType.create({
      data: {
        id: SnowFlake.generate(),
        ...carType,
      },
    });
  }

  // Ensure only the seeded car types are active (important when names changed, e.g. Comfort -> Standard).
  const allowedNames = CAR_TYPES.map((c) => c.name);
  await prisma.carType.updateMany({
    where: { name: { notIn: allowedNames } },
    data: { isActive: false },
  });

  console.log("Seed: CarTypes upserted.");
}

async function main() {
  await seedCarTypes();
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
