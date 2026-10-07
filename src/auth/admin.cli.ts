import { eq } from 'drizzle-orm';
import { createDatabase } from '../database/database';
import { adminAccounts, adminSessions } from '../database/schema';
import { credentialsSchema, PasswordDto } from './auth.dto';
import { hashPassword } from './password';

async function run() {
  const credentials = credentialsSchema
    .extend({ password: PasswordDto.schema.shape.newPassword })
    .parse({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
  const db = createDatabase();
  try {
    const email = credentials.email.toLowerCase();
    const passwordHash = await hashPassword(credentials.password);
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(adminAccounts)
        .where(eq(adminAccounts.email, email))
        .limit(1);
      if (existing && process.argv[2] !== '--reset')
        throw new Error(
          'Admin already exists; use --reset for an explicit password reset',
        );
      if (existing) {
        await tx
          .update(adminAccounts)
          .set({ passwordHash, isActive: true })
          .where(eq(adminAccounts.id, existing.id));
        await tx
          .delete(adminSessions)
          .where(eq(adminSessions.adminId, existing.id));
      } else
        await tx.insert(adminAccounts).values({
          email,
          passwordHash,
          isActive: true,
        });
    });
    console.log('Admin account saved.');
  } finally {
    await db.$client.end();
  }
}

void run().catch(() => {
  console.error(
    'Admin setup failed. Check environment, database, and whether the account already exists.',
  );
  process.exitCode = 1;
});
