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
    this.from = config.get('MAIL_FROM', { infer: true });
    this.isProd = config.get('NODE_ENV', { infer: true }) === 'production';
    const host = config.get('SMTP_HOST', { infer: true });
    if (host) {
      const user = config.get('SMTP_USER', { infer: true });
      this.transport = createTransport({
        host,
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_PORT', { infer: true }) === 465,
        auth: user ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) } : undefined,
      });
    }
  }

  /** Never throws: a mail outage must not break registration or reveal account state. */
  async send(msg: MailMessage): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.sendMail({ from: this.from, ...msg });
      } else if (!this.isProd) {
        // Development only: no SMTP configured, so print the message (links included) to the API log.
        this.logger.warn(`DEV MAIL (SMTP not configured)\nTo: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}`);
      } else {
        this.logger.error('SMTP is not configured; email not sent');
      }
    } catch (err) {
      this.logger.error(`Email delivery failed: ${(err as Error).message}`);
    }
  }
}
