import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Env } from '../config/env';
import { MailMessage, MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService', () => {
  const sendMail = jest.fn();
  const transport = { sendMail } as unknown as Transporter;
  const configValues: Partial<Env> = {
    MAIL_FROM: 'SAZU Marketplace <no-reply@example.com>',
    NODE_ENV: 'production',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user',
    SMTP_PASSWORD: 'password',
  };
  const config = {
    get: (key: keyof Env) => configValues[key],
  } as unknown as ConfigService<Env, true>;
  const message: MailMessage = {
    to: 'buyer@example.com',
    subject: 'Verification code',
    text: '12345678',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createTransport as jest.Mock).mockReturnValue(transport);
  });

  it('waits for SMTP delivery and resolves only after sendMail completes', async () => {
    const service = new MailService(config);
    sendMail.mockResolvedValue({ accepted: ['buyer@example.com'] });

    await expect(service.send(message)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith({
      from: configValues.MAIL_FROM,
      ...message,
    });
  });
});
