import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

vi.mock('../middleware/security.js', () => ({
  checkCircuitBreaker: vi.fn(() => false),
  toIPv4: vi.fn(() => '127.0.0.1'),
}));

async function buildApp() {
  const { default: aiRouter } = await import('./ai.js');
  const app = express();
  app.use(express.json());
  app.use('/', aiRouter);
  return app;
}

describe('POST /api/generate', () => {
  let originalKey;

  beforeEach(() => {
    originalKey = process.env.GROQ_API_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalKey;
    }
    vi.clearAllMocks();
  });

  it('returns 503 and does not call Groq when GROQ_API_KEY is absent', async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = (await import('node-fetch')).default;
    const app = await buildApp();

    const res = await request(app).post('/').send({ prompt: 'hello' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'AI service not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Groq and returns a response when GROQ_API_KEY is configured', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const fetchMock = (await import('node-fetch')).default;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
    });
    const app = await buildApp();

    const res = await request(app).post('/').send({ prompt: 'hello' });

    expect(res.status).toBe(200);
    expect(res.body.response).toBe('pong');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
