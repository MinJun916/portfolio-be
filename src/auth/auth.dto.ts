import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const credentialsSchema = z.strictObject({
  email: z.email().max(254).describe('관리자 이메일'),
  password: z.string().min(1).max(128).describe('관리자 비밀번호'),
});
export class LoginDto extends createZodDto(credentialsSchema) {}
export class PasswordDto extends createZodDto(
  z.strictObject({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(6).max(128).describe('6~128자 새 비밀번호'),
  }),
) {}
export class AdminDto extends createZodDto(
  z.object({ id: z.uuid(), email: z.email() }),
) {}
export class LoginResultDto extends createZodDto(
  z.object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.literal(28800),
    admin: AdminDto.schema,
  }),
) {}
export class AuthResultDto extends createZodDto(
  z.object({ message: z.string() }),
) {}
