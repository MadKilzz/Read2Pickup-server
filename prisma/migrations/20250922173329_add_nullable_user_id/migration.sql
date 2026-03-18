/*
  Warnings:

  - You are about to drop the column `usersId` on the `Otp` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `Otp` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."Otp" DROP CONSTRAINT "Otp_usersId_fkey";

-- DropIndex
DROP INDEX "public"."Otp_usersId_key";

-- AlterTable
ALTER TABLE "public"."Otp" DROP COLUMN "usersId",
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Otp_userId_key" ON "public"."Otp"("userId");

-- AddForeignKey
ALTER TABLE "public"."Otp" ADD CONSTRAINT "Otp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
