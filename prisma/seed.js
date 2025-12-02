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

  // Create superuser (if not exists)
  // Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required for seeding.'
    );
  }

  console.log(`Creating/updating superuser: ${adminEmail}`);

  // Check if a superuser already exists
  const existingSuperuser = await prisma.user.findFirst({
    where: { role: 'SUPERUSER' },
  });

  if (existingSuperuser && existingSuperuser.email !== adminEmail) {
    console.warn(
      `⚠️  Warning: A superuser already exists (${existingSuperuser.email}). Skipping superuser creation.`
    );
    console.log('Database seeding completed.');
    return;
  }

  // Hash password for superuser
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Create or update superuser
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      // Update password if user already exists (optional - comment out to preserve existing password)
      // passwordHash,
      emailVerified: true, // Ensure superuser email is always verified
      role: 'SUPERUSER', // Ensure role is set to SUPERUSER
    },
    create: {
      email: adminEmail,
      passwordHash,
      emailVerified: true, // Superuser is pre-verified
      role: 'SUPERUSER', // Set as superuser
    },
  });

  console.log('✅ Superuser created/updated:', {
    id: adminUser.id,
    email: adminUser.email,
    emailVerified: adminUser.emailVerified,
    role: adminUser.role,
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
