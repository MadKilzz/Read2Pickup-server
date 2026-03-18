import { Prisma } from "@prisma/client";
import Service from "./Service";

/**
 * DeviceTokenService – opslag en revoke van push device tokens (driver app).
 * @extends Service
 */
export default class DeviceTokenService extends Service {
    public async findFirst(options: Prisma.DeviceTokenFindFirstArgs) {
        try {
            return await this.prisma.deviceToken.findFirst({ ...options });
        } catch (e: unknown) {
            throw e;
        }
    }

    public async create(options: Prisma.DeviceTokenCreateArgs) {
        try {
            return await this.prisma.deviceToken.create({ ...options });
        } catch (e: unknown) {
            throw e;
        }
    }

    public async update(options: Prisma.DeviceTokenUpdateArgs) {
        try {
            return await this.prisma.deviceToken.update({ ...options });
        } catch (e: unknown) {
            throw e;
        }
    }

    public async upsert(options: Prisma.DeviceTokenUpsertArgs) {
        try {
            return await this.prisma.deviceToken.upsert({ ...options });
        } catch (e: unknown) {
            throw e;
        }
    }

    /**
     * Zet revokedAt = now() voor alle device tokens van een user (bij logout).
     */
    public async revokeAllForUser(userId: string) {
        try {
            await this.prisma.deviceToken.updateMany({
                where: { userId },
                data: { revokedAt: new Date() },
            });
        } catch (e: unknown) {
            throw e;
        }
    }
}
