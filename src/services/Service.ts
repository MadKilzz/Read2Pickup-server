import { PrismaClient } from '@/utils/database';
import type { PrismaClient as IPrismaClient } from '@prisma/client';

class Service {
  /**
   * Prisma client instance
   */
  protected get prisma(): IPrismaClient {
    return PrismaClient;
  }

  /**
   * Transaction helper
   */
  protected async transaction<T>(callback: (tx: IPrismaClient) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      // cast zodat TS begrijpt dat tx een volledige Prisma client is
      return await callback(tx as IPrismaClient);
    });
  }
}

export default Service;
