import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Wraps successful responses as `{ data, meta? }`. Paginated handlers may return `{ data, meta }` themselves. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        const v = value as unknown;
        if (v && typeof v === 'object' && 'data' in v && 'meta' in v) return v as ApiResponse<T>;
        return { data: value };
      }),
    );
  }
}
