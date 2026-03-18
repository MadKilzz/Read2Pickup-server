/*
  Warnings:

  - A unique constraint covering the columns `[usersId]` on the table `Otp` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Otp_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "Otp_usersId_key" ON "public"."Otp"("usersId");
