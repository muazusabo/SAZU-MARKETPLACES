import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/** Consistent error shape. Never leaks stack traces or internals for unexpected errors. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Something went wrong on our side. Please try again.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const rest: Record<string, unknown> = { ...(body as Record<string, unknown>) };
        message = (rest.message as string | string[]) ?? exception.message;
        for (const key of ['message', 'statusCode', 'error']) delete rest[key];
        if (Object.keys(rest).length) details = rest;
      }
    } else {
      this.logger.error(
        `Unhandled error on ${req.method} ${req.url}: ${(exception as Error)?.stack ?? String(exception)}`,
      );
    }

    res.status(statusCode).json({
      statusCode,
      message,
      ...(details ? { details } : {}),
      path: req.url,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
}
