import { SettingsService } from './settings.service';

describe('SettingsService site logo', () => {
  const logoPath = 'cloudinary:branding/logo/12345678-1234-1234-1234-123456789abc.webp';

  it('accepts only generated public logo keys', () => {
    const service = new SettingsService({} as never, {} as never, { get: () => 'test' } as never);

    expect(service.validate('site_logo_path', logoPath)).toBe(logoPath);
    expect(service.validate('site_logo_path', '')).toBe('');
    expect(() => service.validate('site_logo_path', 'https://example.com/logo.webp')).toThrow(/valid site logo/);
  });

  it('publishes the logo URL without exposing its storage key', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ key: 'site_logo_path', value: logoPath }] }),
    };
    const storage = {
      publicUrl: jest.fn((key: string) => `https://cdn.example/${key}`),
    };
    const service = new SettingsService(db as never, storage as never, { get: () => 'test' } as never);

    const content = await service.publicContent();

    expect(content.site_logo_url).toBe(`https://cdn.example/${logoPath}`);
    expect(content).not.toHaveProperty('site_logo_path');
  });
});
