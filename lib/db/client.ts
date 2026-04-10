import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL as string
  const adapter = new PrismaMariaDb(connectionString)
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
