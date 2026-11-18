import { SettingsService } from './settings.service';

describe('SettingsService site logo', () => {
  const logoPath = 'cloudinary:branding/logo/12345678-1234-1234-1234-123456789abc.webp';
  const heroPath = 'cloudinary:branding/hero/12345678-1234-1234-1234-123456789abc.webp';

  it('accepts only generated public logo keys', () => {
    const service = new SettingsService({} as never, {} as never, { get: () => 'test' } as never);

    expect(service.validate('site_logo_path', logoPath)).toBe(logoPath);
    expect(service.validate('site_logo_path', '')).toBe('');
    expect(() => service.validate('site_logo_path', 'https://example.com/logo.webp')).toThrow(/valid site logo/);
  });

  it('accepts generated homepage hero paths and only supported focal positions', () => {
    const service = new SettingsService({} as never, {} as never, { get: () => 'test' } as never);

    expect(service.validate('homepage_hero_image_path', heroPath)).toBe(heroPath);
    expect(service.validate('homepage_hero_image_position', 'top')).toBe('top');
    expect(() => service.validate('homepage_hero_image_path', 'https://example.com/hero.webp')).toThrow(/valid homepage hero/);
    expect(() => service.validate('homepage_hero_image_position', 'stretch')).toThrow(/hero image position/);
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
    expect(content.homepage_hero_image_url).toBe('');
    expect(content.homepage_hero_image_position).toBe('center');
    expect(content).not.toHaveProperty('site_logo_path');
    expect(content).not.toHaveProperty('homepage_hero_image_path');
  });

  it('publishes the homepage hero image URL and position without exposing its storage key', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { key: 'homepage_hero_image_path', value: heroPath },
          { key: 'homepage_hero_image_position', value: 'right' },
        ],
      }),
    };
    const storage = {
      publicUrl: jest.fn((key: string) => `https://cdn.example/${key}`),
    };
    const service = new SettingsService(db as never, storage as never, { get: () => 'test' } as never);

    const content = await service.publicContent();

    expect(content.homepage_hero_image_url).toBe(`https://cdn.example/${heroPath}`);
    expect(content.homepage_hero_image_position).toBe('right');
    expect(content).not.toHaveProperty('homepage_hero_image_path');
  });
});
