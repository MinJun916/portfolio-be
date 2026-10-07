import { Logger } from '@nestjs/common';
import { createDatabase } from './database';

it('유휴 DB 연결 오류가 프로세스를 종료하거나 내부 정보를 노출하지 않는다', async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://localhost/unused_test';
  const log = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const db = createDatabase();
  try {
    expect(() =>
      db.$client.emit('error', new Error('sensitive connection detail')),
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith('Idle database connection failed.');
  } finally {
    await db.$client.end();
    log.mockRestore();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
