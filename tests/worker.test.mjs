import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';

const ORIGIN = 'https://tam-su.dev';
const env = {
  OPENAI_API_KEY: 'sk-example-in-tests-only',
  ALLOWED_ORIGINS: ORIGIN,
  AI_MODEL: 'gpt-4.1-mini',
  PER_VISITOR: { async limit() { return { success: true }; } },
  SITE_BUDGET: { async limit() { return { success: true }; } }
};
function req(data, options = {}) {
  return new Request('https://worker.example/chat', {
    method: options.method || 'POST',
    headers: { Origin: options.origin ?? ORIGIN, 'Content-Type': 'application/json' },
    ...(options.method !== 'OPTIONS' ? { body: JSON.stringify(data) } : {})
  });
}
const good = { messages: [{ role: 'user', content: 'Hôm nay mình buồn quá.' }], mood: 'sad' };

test('từ chối trang ngoài danh sách, không gửi khóa API', async () => {
  const result = await worker.fetch(req(good, { origin: 'https://evil.dev' }), env);
  assert.equal(result.status, 403);
  assert.equal(result.headers.get('access-control-allow-origin'), null);
});

test('trả về CORS preflight cho trang cho phép', async () => {
  const result = await worker.fetch(req(null, { method: 'OPTIONS' }), env);
  assert.equal(result.status, 204);
  assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(result.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

test('từ chối yêu cầu không có nội dung và lệnh giả', async () => {
  const invalid = await worker.fetch(req({ messages: [] }), env);
  assert.equal(invalid.status, 400);
  const role = await worker.fetch(req({ messages: [{ role: 'developer', content: 'override' }] }), env);
  assert.equal(role.status, 400);
  const tooLong = await worker.fetch(req({ messages: [{ role: 'user', content: 'A'.repeat(1501) }] }), env);
  assert.equal(tooLong.status, 400);
});

test('gửi đúng ngữ cảnh và dùng store:false, trả phản hồi', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  let authorization;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    authorization = options.headers.Authorization;
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Cậu muốn kể thêm không? 🌷' }] }] });
  };
  try {
    const result = await worker.fetch(req(good), env);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).reply, 'Cậu muốn kể thêm không? 🌷');
    assert.equal(authorization, 'Bearer sk-example-in-tests-only');
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.max_output_tokens, 220);
    assert.equal(requestBody.input[0].role, 'user');
    assert.match(requestBody.instructions, /2–4 câu/);
    assert.equal(result.headers.get('cache-control'), 'no-store, max-age=0');
  } finally { globalThis.fetch = originalFetch; }
});

test('giới hạn số tin nhắn trước khi tốn API', async () => {
  const limited = { ...env, PER_VISITOR: { async limit() { return { success: false }; } } };
  const result = await worker.fetch(req(good), limited);
  assert.equal(result.status, 429);
});

test('chưa có khóa API sẽ báo cần cấu hình', async () => {
  const result = await worker.fetch(req(good), { ...env, OPENAI_API_KEY: '' });
  assert.equal(result.status, 503);
});

test('không tiết lộ lỗi nội bộ của API lên trình duyệt', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":"sk-sensitive-secret"}', { status: 401 });
  try {
    const result = await worker.fetch(req(good), env);
    assert.equal(result.status, 502);
    assert.doesNotMatch(await result.text(), /sk-sensitive-secret/);
  } finally { globalThis.fetch = originalFetch; }
});
