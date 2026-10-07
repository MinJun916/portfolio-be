import { DataSource } from 'typeorm';
import { AdminAccount, AdminSession } from '../database/entities';
import { getDataSourceOptions } from '../database/options';
import { credentialsSchema, PasswordDto } from './auth.dto';
import { hashPassword } from './password';

async function run() {
  const credentials = credentialsSchema
    .extend({ password: PasswordDto.schema.shape.newPassword })
    .parse({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
  const db = await new DataSource(getDataSourceOptions()).initialize();
  try {
    const email = credentials.email.toLowerCase();
    const passwordHash = await hashPassword(credentials.password);
    await db.transaction(async (manager) => {
      const existing = await manager.findOneBy(AdminAccount, { email });
      if (existing && process.argv[2] !== '--reset')
        throw new Error(
          'Admin already exists; use --reset for an explicit password reset',
        );
      if (existing) {
        await manager.update(AdminAccount, existing.id, {
          passwordHash,
          isActive: true,
        });
        await manager.delete(AdminSession, { adminId: existing.id });
      } else
        await manager.insert(AdminAccount, {
          email,
          passwordHash,
          isActive: true,
        });
    });
    console.log('Admin account saved.');
  } finally {
    await db.destroy();
  }
}

void run().catch(() => {
  console.error(
    'Admin setup failed. Check environment, database, and whether the account already exists.',
  );
  process.exitCode = 1;
});
