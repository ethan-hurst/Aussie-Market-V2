import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Provide mock public env for modules that import $env/dynamic/public
vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock'
  }
}));


