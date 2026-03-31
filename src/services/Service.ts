import { PrismaClient } from '@/utils/database';
import type { Prisma, PrismaClient as IPrismaClient } from '@prisma/client';

export type ServiceTransactionOptions = {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    maxWait?: number;
    timeout?: number;
};

class Service {
  /**
   * Prisma client instance
   */
  protected get prisma(): IPrismaClient {
    return PrismaClient;
  }

  /**
   * Transaction helper (optioneel isolationLevel / timeouts, zelfde client als elders).
   */
  protected async transaction<T>(
    callback: (tx: IPrismaClient) => Promise<T>,
    options?: ServiceTransactionOptions
  ): Promise<T> {
    const run = async (tx: unknown) => callback(tx as IPrismaClient);
    if (options) {
      return await this.prisma.$transaction(run, options);
    }
    return await this.prisma.$transaction(run);
  }
}

export default Service;
