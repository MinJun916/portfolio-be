import { AppController } from './app.controller';
import { hashPassword, verifyPassword } from './auth/password';

it('reports process health', () => {
  expect(new AppController().health()).toEqual({ status: 'ok' });
});

it('stores salted password hashes and rejects a wrong password', async () => {
  const first = await hashPassword('a-long-test-password');
  const second = await hashPassword('a-long-test-password');
  expect(first).not.toEqual(second);
  expect(await verifyPassword('a-long-test-password', first)).toBe(true);
  expect(await verifyPassword('wrong', first)).toBe(false);
});
