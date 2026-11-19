import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport?: Transporter;
  private readonly from: string;
  private readonly isProd: boolean;

  constructor(config: ConfigService<Env, true>) {
    const configuredFrom = config.get('MAIL_FROM', { infer: true });
    const smtpUser = config.get('SMTP_USER', { infer: true });
    this.from = configuredFrom.includes('yourgmail@gmail.com') && smtpUser
      ? `SAZU Marketplace <${smtpUser}>`
      : configuredFrom;
    this.isProd = config.get('NODE_ENV', { infer: true }) === 'production';
    const host = config.get('SMTP_HOST', { infer: true });
    if (host) {
      this.transport = createTransport({
        host,
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_PORT', { infer: true }) === 465,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 15_000,
        auth: smtpUser ? { user: smtpUser, pass: config.get('SMTP_PASSWORD', { infer: true }) } : undefined,
      });
    }
  }

  /** Deliver the message and surface failures so account and verification flows do not claim success without a send. */
  async send(msg: MailMessage): Promise<void> {
    const transport = this.transport;
    if (transport) {
      await this.deliver(transport, msg);
      return;
    }
    if (!this.isProd) {
      // Development only: no SMTP configured, so print the message (code included) to the API log.
      this.logger.warn(`DEV MAIL (SMTP not configured)\nTo: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}`);
      return;
    }
    this.logger.error('SMTP is not configured; email not sent');
    throw new Error('Email delivery is unavailable.');
  }

  private async deliver(transport: Transporter, msg: MailMessage): Promise<void> {
    try {
      const result = await transport.sendMail({ from: this.from, ...msg });
      if (!result.accepted?.length || result.rejected?.length) {
        throw new Error('SMTP server did not accept the recipient');
      }
    } catch (err) {
      this.logger.error(`Email delivery failed: ${(err as Error).message}`);
      throw new Error('Email could not be sent. Please try again.');
    }
  }
}
