import { DatabaseService } from '../database/database.service';
import { EmailTokenService } from './email-token.service';
import { hashToken } from './token.util';

describe('EmailTokenService verification codes', () => {
  it('generates an 8-digit code and stores only its hash', async () => {
    const connectionQuery = jest.fn().mockResolvedValue({ rows: [] });
    const db = {
      transaction: (work: (client: { query: jest.Mock }) => Promise<unknown>) => work({ query: connectionQuery }),
      query: jest.fn(),
    } as unknown as DatabaseService;
    const service = new EmailTokenService(db);

    const code = await service.issueVerificationCode('user-1', 10);
    const insert = connectionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO email_tokens'));

    expect(code).toMatch(/^\d{8}$/);
    expect(insert?.[1]).toEqual(['user-1', 'verify_email', hashToken(code), 10]);
    expect(insert?.[1]).not.toContain(code);
  });

  it('uses a user-scoped atomic update to consume and count code attempts', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
    const db = { query } as unknown as DatabaseService;
    const service = new EmailTokenService(db);

    await expect(service.consumeVerificationCode('user-1', '01234567')).resolves.toBe('user-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('attempts = attempts + 1'),
      ['user-1', hashToken('01234567'), 5],
    );
    expect(query.mock.calls[0]?.[0]).toContain("purpose = 'verify_email'");
    expect(query.mock.calls[0]?.[0]).toContain('attempts < $3');
  });
});
