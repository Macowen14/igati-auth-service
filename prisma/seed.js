/**
 * Prisma Seed Script
 * 
 * Creates initial admin user for testing/development.
 * 
 * Usage: npm run db:seed
 * 
 * Note: This is commented out by default. Uncomment to enable seeding.
 */

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // TODO: RESUME-HERE - Uncomment and configure admin user creation
  
  /*
  // Hash password for admin user
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      emailVerified: true,
    },
  });

  console.log('Admin user created:', {
    id: adminUser.id,
    email: adminUser.email,
  });
  */

  console.log('Database seeding completed.');
}

main()
  .catch((error) => {
    console.error('Error during seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

