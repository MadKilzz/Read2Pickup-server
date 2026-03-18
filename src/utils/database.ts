import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as PrismaClientBase } from "@prisma/client";

// DATABASE_URL check
const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in your environment variables");
}

// Maak de adapter aan
const adapter = new PrismaPg({ connectionString });

// Maak de PrismaClient aan met adapter
export const PrismaClient = new PrismaClientBase({ adapter });
