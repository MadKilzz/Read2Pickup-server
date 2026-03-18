import { Prisma } from '@prisma/client';
import Service from './Service';

/**
 * UserService
 * @extends Service
 */
export default class OtpService extends Service {

    /**
     * Find user
     * @param options User options
     */
    public async find(options: Prisma.OtpFindFirstArgs) {
        try {
            return await this.prisma.otp.findFirst({ ...options });
        } catch (e: any) {
            throw e;
        }
    }

    public async update(options: Prisma.OtpUpdateArgs) {
        try {
            return await this.prisma.otp.update({ ...options });
        } catch (e: any) {
            throw e;
        }
    }

    public async create(options: Prisma.OtpCreateArgs) {
        try {
            return this.prisma.otp.create({ ...options })
        } catch (e) {
            throw e;
        }
    }

    public async delete(options: Prisma.OtpDeleteArgs) {
        try {
            return await this.prisma.otp.delete({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async deleteMany(options: Prisma.OtpDeleteManyArgs) {
        try {
            return await this.prisma.otp.deleteMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async upsert(options: Prisma.OtpUpsertArgs) {
        try {
            return await this.prisma.otp.upsert({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public generate() {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Valid for 15 minutes

        return {
            otpCode,
            expiresAt
        }
    }

    public async verify(userId: string, code: string) {
        const otp = await this.find({
            where: {
                userId: userId
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        if (!otp) return { success: false, message: "Invalid OTP." }

        const status = (otp.code === code) && !otp.isUsed && otp.expiresAt >= new Date() ? "VALID" : "INVALID";

        switch (status) {
            case "VALID":
                const updatedOtp = await this.prisma.otp.update({
                    where: { id: otp.id },
                    data: { isUsed: true },
                });

                if (!updatedOtp) {
                    return { success: false };
                }
                return { success: true };

            case "INVALID":
            default:
                return { success: false };
        }


    }

}