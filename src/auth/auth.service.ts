import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';
import { AdminAccount, AdminSession } from '../database/entities';
import { hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'portfolio_admin';
export const SESSION_MS = 8 * 60 * 60 * 1000;
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(private readonly db: DataSource) {}

  async login(email: string, password: string, previousToken?: string) {
    const account = await this.db
      .getRepository(AdminAccount)
      .findOneBy({ email: email.toLowerCase(), isActive: true });
    if (
      !(await verifyPassword(
        password,
        account?.passwordHash ?? (await this.dummyHash),
      )) ||
      !account
    ) {
      throw new UnauthorizedException('이메일 또는 비밀번호를 확인해주세요.');
    }
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async (manager) => {
      const current = await manager.findOne(AdminAccount, {
        where: { id: account.id, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.passwordHash !== account.passwordHash)
        throw new UnauthorizedException(
          '로그인 정보가 변경되었습니다. 다시 로그인해주세요.',
        );
      await manager.delete(AdminSession, {
        expiresAt: LessThanOrEqual(new Date()),
      });
      if (previousToken)
        await manager.delete(AdminSession, {
          tokenHash: tokenHash(previousToken),
        });
      await manager.insert(AdminSession, {
        tokenHash: tokenHash(token),
        adminId: account.id,
        expiresAt: new Date(Date.now() + SESSION_MS),
      });
    });
    return { token, admin: { id: account.id, email: account.email } };
  }

  async authenticate(token?: string): Promise<{ id: string; email: string }> {
    if (!token || !/^[\w-]{43}$/.test(token))
      throw new UnauthorizedException('로그인이 필요합니다.');
    const session = await this.db.getRepository(AdminSession).findOneBy({
      tokenHash: tokenHash(token),
      expiresAt: MoreThan(new Date()),
    });
    const account = session
      ? await this.db
          .getRepository(AdminAccount)
          .findOneBy({ id: session.adminId, isActive: true })
      : null;
    if (!account) throw new UnauthorizedException('로그인이 만료되었습니다.');
    return { id: account.id, email: account.email };
  }

  async logout(token: string) {
    await this.db
      .getRepository(AdminSession)
      .delete({ tokenHash: tokenHash(token) });
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const account = await this.db
      .getRepository(AdminAccount)
      .findOneByOrFail({ id });
    if (!(await verifyPassword(currentPassword, account.passwordHash)))
      throw new UnauthorizedException('현재 비밀번호를 확인해주세요.');
    const passwordHash = await hashPassword(newPassword);
    await this.db.transaction(async (manager) => {
      const changed = await manager.update(
        AdminAccount,
        { id, passwordHash: account.passwordHash },
        { passwordHash },
      );
      if (!changed.affected)
        throw new UnauthorizedException(
          '비밀번호가 이미 변경되었습니다. 다시 로그인해주세요.',
        );
      await manager.delete(AdminSession, { adminId: id });
    });
  }
}
