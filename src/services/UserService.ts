import { Prisma } from '@prisma/client';
import Service from './Service';

/**
 * UserService
 * @extends Service
 */
class UserService extends Service {

    /**
     * Find user
     * @param options User options
     */
    public async find(options: Prisma.UserFindFirstArgs) {
        try {
            return await this.prisma.user.findFirst({ ...options });
        } catch (e: any) {
            throw e;
        }
    }

     public async create(options: Prisma.UserCreateArgs) {
        try {
            return await this.prisma.user.create({ ...options });
        } catch (e: any) {
            throw e;
        }
    }

    public async update(options: Prisma.UserUpdateArgs) {
        try {
            return await this.prisma.user.update({ ...options });
        } catch (e: any) {
            throw e;
        }
    }

}

export default UserService;