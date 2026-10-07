import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';
import { z } from 'zod';
import { AdminAccount, AdminSession } from '../database/entities';
import { hashPassword, verifyPassword } from './password';

export const SESSION_SECONDS = 8 * 60 * 60;
export const SESSION_MS = SESSION_SECONDS * 1000;
export const JWT_ISSUER = 'portfolio-api';
export const JWT_AUDIENCE = 'portfolio-admin';
const claimsSchema = z.object({
  sub: z.uuid(),
  jti: z.string().regex(/^[\w-]{43}$/),
  exp: z.number().int().positive(),
  iss: z.literal(JWT_ISSUER),
  aud: z.literal(JWT_AUDIENCE),
});
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
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
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await this.jwt.signAsync({
      sub: account.id,
      jti: randomBytes(32).toString('base64url'),
      iat: issuedAt,
    });
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
      await manager.insert(AdminSession, {
        tokenHash: tokenHash(token),
        adminId: account.id,
        expiresAt: new Date(issuedAt * 1000 + SESSION_MS),
      });
    });
    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      expiresIn: SESSION_SECONDS,
      admin: { id: account.id, email: account.email },
    };
  }

  async authenticate(token?: string): Promise<{ id: string; email: string }> {
    if (
      !token ||
      token.length > 4096 ||
      !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)
    )
      throw new UnauthorizedException('로그인이 필요합니다.');
    let claims: z.infer<typeof claimsSchema>;
    try {
      claims = claimsSchema.parse(await this.jwt.verifyAsync(token));
    } catch {
      throw new UnauthorizedException('로그인이 만료되었습니다.');
    }
    const session = await this.db.getRepository(AdminSession).findOneBy({
      tokenHash: tokenHash(token),
      adminId: claims.sub,
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
