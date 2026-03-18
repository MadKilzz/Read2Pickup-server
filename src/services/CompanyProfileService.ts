import { Prisma } from "@prisma/client";
import Service from "./Service";

export default class CompanyProfileService extends Service {
    public async findFirst(options: Prisma.CompanyProfileFindFirstArgs) {
        try {
            return await this.prisma.companyProfile.findFirst({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async findMany(options: Prisma.CompanyProfileFindManyArgs) {
        try {
            return await this.prisma.companyProfile.findMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async create(options: Prisma.CompanyProfileCreateArgs) {
        try {
            return await this.prisma.companyProfile.create({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async update(options: Prisma.CompanyProfileUpdateArgs) {
        try {
            return await this.prisma.companyProfile.update({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async delete(options: Prisma.CompanyProfileDeleteArgs) {
        try {
            return await this.prisma.companyProfile.delete({ ...options });
        } catch (e) {
            throw e;
        }
    }
}
