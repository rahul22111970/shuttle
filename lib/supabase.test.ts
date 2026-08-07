const ENV_KEYS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;

describe('supabase client env guard', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  it.each(ENV_KEYS)('throws SupabaseEnvMissingError when %s is missing', (missingKey) => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_fake';
    delete process.env[missingKey];
    jest.resetModules();

    let caught: unknown;
    try {
      require('./supabase');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('SupabaseEnvMissingError');
  });

  it('exports a client when both vars are set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_fake';
    jest.resetModules();

    const { supabase } = require('./supabase');
    expect(supabase.auth).toBeDefined();
  });
});
