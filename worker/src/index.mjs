/**
 * Một Chút Bình Yên — Cloudflare Worker API
 * No database, no conversation logs, no API key in browser.
 * OpenAI Responses API with store:false; abuse controls are approximate.
 */
const MOODS = Object.freeze({
  neutral: 'Người dùng chưa chọn tâm trạng.',
  sad: 'Người dùng nói đang hơi buồn. Hãy lắng nghe nhẹ nhàng, không mặc định biết nguyên nhân.',
  tired: 'Người dùng nói đang mệt. Đừng vội ép họ suy nghĩ tích cực hoặc đưa kế hoạch.',
  lonely: 'Người dùng thấy cô đơn. Hãy phản hồi ấm áp, tránh khiến họ lệ thuộc vào ứng dụng.',
  happy: 'Người dùng có chuyện vui. Hãy vui cùng họ, không biến câu chuyện thành bài giảng.'
});

const SYSTEM_INSTRUCTIONS = `Bạn là "Một Chút Bình Yên", một hệ thống trò chuyện tự động bằng tiếng Việt, dành cho người cần được lắng nghe.
MỤC TIÊU: Khiến người dùng cảm thấy được tiếp nhận, chứ không phải được giảng đạo.
PHONG CÁCH:
- Giọng trẻ trung, ấm, tự nhiên như một người bạn bình tĩnh; xưng "mình - cậu" nếu phù hợp với cách người dùng nói. Không làm màu, không dài dòng.
- Mặc định chỉ 2–4 câu ngắn (khoảng 30–75 từ). Nếu người dùng nói rất ngắn, có thể chỉ trả lời 1–2 câu. Trường hợp nguy cơ an toàn, được phép dài hơn.
- Nhận diện cảm xúc cụ thể dựa trên điều vừa được kể, không lặp sáo ngữ kiểu "Tôi hiểu cảm giác của bạn", "Hãy suy nghĩ tích cực", "Cố lên", "Mọi chuyện rồi sẽ ổn".
- Có thể hỏi MỘT câu hỏi mở nhẹ nhàng nếu thích hợp, không nhất thiết phải hỏi ở mọi lượt. Lúc người dùng chỉ cần người nghe thì hãy lắng nghe.
- Không đoán ra chi tiết, không chẩn đoán bệnh, không tuyên bố biết chính xác cảm xúc hoặc hoàn cảnh của họ. Không phán xét, không ra lệnh, không thao túng.
- Nếu họ hỏi lời khuyên, đề xuất nhỏ và khả thi, giữ quyền quyết định cho họ.
- Không dùng nhiều emoji (tối đa 1 nếu phù hợp). Tránh nhắc đi nhắc lại tên website.
- Nếu người dùng viết tiếng Anh, có thể trả lời tiếng Anh; còn lại ưu tiên tiếng Việt.
MINH BẠCH: Bạn là phần mềm trò chuyện tự động, KHÔNG phải người thật. Không cần tự giới thiệu trong mỗi câu, nhưng nếu người dùng hỏi thì nói rõ, đừng giả làm người thật. Không hứa bảo mật tuyệt đối hoặc sẵn sàng 24/7.
AN TOÀN: Nếu nhận ra nguy cơ tự hại/tự sát hoặc bạo lực tức thời, ưu tiên hỏi người dùng có đang an toàn không, khuyên tránh xa phương tiện gây hại, liên hệ ngay người đáng tin cậy và số khẩn cấp tại địa phương. Không chỉ trả lời một câu ngắn thông thường. Không cung cấp hướng dẫn gây hại. Không đóng vai chuyên gia sức khỏe tâm thần.
DỮ LIỆU: Chỉ phản hồi ngữ cảnh hội thoại được gửi đến, không biết về danh tính người dùng và đừng giả vờ biết.`;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Origin',
      ...extraHeaders
    }
  });
}

function allowedOrigin(origin, env) {
  const origins = String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  return Boolean(origin && origins.includes(origin));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600'
  };
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return null;
  let totalCharacters = 0;
  const cleaned = [];
  for (const item of raw) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return null;
    const content = item.content.trim();
    if (!content || content.length > (item.role === 'user' ? 1500 : 3500)) return null;
    totalCharacters += content.length;
    if (totalCharacters > 14000) return null;
    cleaned.push({ role: item.role, content });
  }
  return cleaned.at(-1)?.role === 'user' ? cleaned : null;
}

function parseOutput(apiPayload) {
  if (typeof apiPayload.output_text === 'string' && apiPayload.output_text.trim()) return apiPayload.output_text.trim();
  const chunks = [];
  for (const item of apiPayload.output || []) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const piece of item.content) {
      if (piece.type === 'output_text' && typeof piece.text === 'string') chunks.push(piece.text);
    }
  }
  return chunks.join('\n').trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true });
    if (url.pathname !== '/chat') return json({ error: 'Không tìm thấy đường dẫn.' }, 404);

    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigin(origin, env)) return json({ error: 'Trang gọi đến chưa được cho phép.' }, 403);
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Vary': 'Origin' } });
    }
    if (request.method !== 'POST') return json({ error: 'Chỉ hỗ trợ gửi tin nhắn.' }, 405, cors);
    if (!String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      return json({ error: 'Dữ liệu phải ở dạng JSON.' }, 415, cors);
    }
    if (!env.OPENAI_API_KEY) return json({ error: 'Chủ trang chưa thiết lập khóa kết nối.' }, 503, cors);

    // Tránh lạm dụng khóa API: hạn mức xấp xỉ theo IP và hạn mức chung cho toàn site.
    // IP không được ghi vào nhật ký hoặc gửi tới OpenAI bởi mã nguồn này.
    try {
      const key = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (env.PER_VISITOR) {
        const outcome = await env.PER_VISITOR.limit({ key: 'chat:' + key });
        if (!outcome.success) return json({ error: '429: Cậu nhắn hơi nhanh rồi. Mình nghỉ vài giây nhé.' }, 429, cors);
      }
      if (env.SITE_BUDGET) {
        const outcome = await env.SITE_BUDGET.limit({ key: 'site:all' });
        if (!outcome.success) return json({ error: '429: Hệ thống đang đông người. Cậu ghé lại một chút sau nhé.' }, 429, cors);
      }
    } catch (_) {
      // Ưu tiên bảo vệ chi phí nếu bộ giới hạn gặp lỗi.
      return json({ error: 'Bộ kiểm soát lưu lượng tạm thời chưa sẵn sàng.' }, 503, cors);
    }

    let payload;
    try {
      const len = Number(request.headers.get('Content-Length'));
      if (Number.isFinite(len) && len > 50000) return json({ error: 'Tin nhắn quá dài.' }, 413, cors);
      const body = await request.text();
      if (body.length > 50000) return json({ error: 'Tin nhắn quá dài.' }, 413, cors);
      payload = JSON.parse(body);
    } catch (_) {
      return json({ error: 'Không đọc được nội dung tin nhắn.' }, 400, cors);
    }

    const messages = sanitizeMessages(payload?.messages);
    if (!messages) return json({ error: 'Nội dung trò chuyện không hợp lệ.' }, 400, cors);
    const mood = Object.prototype.hasOwnProperty.call(MOODS, payload?.mood) ? payload.mood : 'neutral';
    const model = env.AI_MODEL || 'gpt-4.1-mini';

    let upstream;
    try {
      upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          instructions: `${SYSTEM_INSTRUCTIONS}\nTÂM TRẠNG ĐƯỢC CHỌN: ${MOODS[mood]}`,
          input: messages,
          max_output_tokens: 220,
          store: false
        }),
        signal: AbortSignal.timeout(25000)
      });
    } catch (_) {
      return json({ error: 'Máy chủ phản hồi hơi chậm, cậu thử lại nhé.' }, 504, cors);
    }

    if (!upstream.ok) {
      // Không trả thông tin chi tiết của nhà cung cấp ra trình duyệt.
      if (upstream.status === 429) return json({ error: '429: Lượt trò chuyện đang quá tải, vui lòng thử lại.' }, 429, cors);
      if (upstream.status === 401) return json({ error: 'Chủ trang cần kiểm tra khóa kết nối.' }, 502, cors);
      return json({ error: 'Hệ thống trò chuyện tạm thời chưa phản hồi.' }, 502, cors);
    }

    let result;
    try { result = await upstream.json(); }
    catch (_) { return json({ error: 'Dữ liệu phản hồi bị gián đoạn.' }, 502, cors); }
    const reply = parseOutput(result);
    if (!reply) return json({ error: 'Chưa nhận được lời hồi đáp.' }, 502, cors);
    return json({ reply: reply.slice(0, 2400) }, 200, cors);
  }
};
