import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiFetchPage, unwrapEnvelope } from './api';

const respond = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }));
afterEach(() => vi.unstubAllGlobals());

describe('unwrapEnvelope', () => {
  it('returns the data of a { data } envelope, including legitimate null, false, 0 and empty values', () => {
    expect(unwrapEnvelope({ data: { id: 1 } })).toEqual({ id: 1 });
    expect(unwrapEnvelope({ data: null })).toBeNull(); // regression: used to return the envelope itself
    expect(unwrapEnvelope({ data: false })).toBe(false);
    expect(unwrapEnvelope({ data: 0 })).toBe(0);
    expect(unwrapEnvelope({ data: [] })).toEqual([]);
  });
  it('keeps paginated responses whole so their meta is not lost', () => {
    const paged = { data: [{ a: 1 }], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };
    expect(unwrapEnvelope(paged)).toBe(paged); // regression: used to return only the array, crashing every list screen
    expect(unwrapEnvelope({ data: [], meta: { hasMore: false, nextBefore: null } })).toEqual({ data: [], meta: { hasMore: false, nextBefore: null } });
  });
  it('passes through bodies that are not envelopes', () => {
    expect(unwrapEnvelope(null)).toBeNull();
    expect(unwrapEnvelope([1, 2])).toEqual([1, 2]);
    expect(unwrapEnvelope({ message: 'x' })).toEqual({ message: 'x' });
  });
});

describe('apiFetch', () => {
  it('gives null for "nothing yet" responses, such as a user with no seller profile', async () => {
    respond(200, { data: null });
    expect(await apiFetch('/sellers/me')).toBeNull();
  });
  it('hands authenticated list calls the full { data, meta } shape the screens expect', async () => {
    respond(200, { data: [{ id: 1 }], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    const r = await apiFetch<{ data: { id: number }[]; meta: { total: number } }>('/seller/products');
    expect(r.data).toEqual([{ id: 1 }]); expect(r.meta.total).toBe(1);
  });
  it('keeps list responses with metadata intact for paginated calls', async () => {
    respond(200, { data: [{ a: 1 }], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
    const r = await apiFetchPage<{ a: number }[]>('/products');
    expect(r.data).toEqual([{ a: 1 }]); expect(r.meta.total).toBe(1);
  });
  it('turns error responses into ApiError with a readable message, joining validation lists', async () => {
    respond(400, { statusCode: 400, message: ['title too short', 'price too low'], requestId: 'abc' });
    await expect(apiFetch('/products')).rejects.toMatchObject({ status: 400, message: 'title too short, price too low', requestId: 'abc' });
    respond(404, { statusCode: 404, message: 'Not found' });
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
  });
  it('reports an unreachable server in plain language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/Could not reach/) });
  });
});
