/**
 * Prisma Seed Script
 *
 * Creates initial admin user for testing/development.
 *
 * Usage: npm run db:seed
 *
 * Note: This is commented out by default. Uncomment to enable seeding.
 */

// Load environment variables from .env file
import 'dotenv/config';

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // Create admin user (if not exists)
  // Set ADMIN_PASSWORD environment variable to customize password
  // Default password: Admin123!
  const adminEmail = process.env.ADMIN_EMAIL || 'mwingamac@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

  console.log(`Creating/updating admin user: ${adminEmail}`);

  // Hash password for admin user
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Create or update admin user
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      // Update password if user already exists (optional - comment out to preserve existing password)
      // TODO: edit update
      // passwordHash,
      emailVerified: true, // Ensure admin email is always verified
    },
    create: {
      email: adminEmail,
      passwordHash,
      emailVerified: true, // Admin users are pre-verified
    },
  });

  console.log('✅ Admin user created/updated:', {
    id: adminUser.id,
    email: adminUser.email,
    emailVerified: adminUser.emailVerified,
  });

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
