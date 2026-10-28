(() => {
  'use strict';

  const CONFIG = window.BINH_YEN_CONFIG || {};
  const API_URL = typeof CONFIG.API_URL === 'string' ? CONFIG.API_URL.trim() : '';
  const IS_DEMO = !API_URL;
  const SESSION_KEY = 'mot-chut-binh-yen-chat-v1';
  const THEME_KEY = 'mot-chut-binh-yen-theme';
  const MAX_CHARACTERS = 1500;
  const MAX_SESSION_MESSAGES = 60;

  const $ = (id) => document.getElementById(id);
  const elements = {
    welcome: $('welcome'), messageList: $('messageList'), chatArea: $('chatArea'),
    messageInput: $('messageInput'), chatForm: $('chatForm'), sendButton: $('sendButton'),
    demoBanner: $('demoBanner'), typingIndicator: $('typingIndicator'),
    moodList: $('moodList'), privacyBtn: $('privacyBtn'), privacyInline: $('privacyInline'),
    themeBtn: $('themeBtn'), downloadBtn: $('downloadBtn'), clearBtn: $('clearBtn'),
    privacyDialog: $('privacyDialog'), clearDialog: $('clearDialog'),
    cancelClear: $('cancelClear'), cancelX: $('cancelX'), confirmClear: $('confirmClear'),
    toast: $('toast')
  };

  let state = { mood: 'neutral', messages: [] };
  let pending = false;
  let currentController = null;
  let toastTimer = null;
  let generation = 0;

  function readSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!saved || !Array.isArray(saved.messages)) return;
      state.mood = ['sad', 'tired', 'lonely', 'happy', 'neutral'].includes(saved.mood) ? saved.mood : 'neutral';
      state.messages = saved.messages
        .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-MAX_SESSION_MESSAGES)
        .map(m => ({ role: m.role, content: m.content.slice(0, 3500), time: Number(m.time) || Date.now() }));
    } catch (_) { /* Chế độ duyệt riêng có thể chặn sessionStorage. */ }
  }
  function saveSession() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (_) { /* Chỉ lưu nếu được phép. */ }
  }
  function readTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
  }
  function saveTheme(value) {
    try { localStorage.setItem(THEME_KEY, value); } catch (_) { /* optional */ }
  }
  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    elements.themeBtn.title = value === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối';
    elements.themeBtn.setAttribute('aria-label', elements.themeBtn.title);
  }
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3400);
  }
  function autoSize() {
    const el = elements.messageInput;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 142) + 'px';
    elements.sendButton.disabled = pending || !el.value.trim();
  }
  function formatTime(value) {
    try { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
    catch (_) { return ''; }
  }
  function scrollToBottom() {
    requestAnimationFrame(() => { elements.chatArea.scrollTop = elements.chatArea.scrollHeight; });
  }
  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderMessage(message) {
    const isUser = message.role === 'user';
    const item = createElement('article', 'message ' + message.role);
    const meta = createElement('div', 'message-topline');
    if (!isUser) meta.append(createElement('div', 'avatar', '✳'));
    meta.append(createElement('span', 'message-name', isUser ? 'Cậu' : 'Một Chút Bình Yên'));
    meta.append(createElement('span', 'message-time', formatTime(message.time)));
    const bubble = createElement('div', 'message-text', message.content);
    item.append(meta, bubble);
    return item;
  }
  function render() {
    const hasMessages = state.messages.length > 0;
    elements.welcome.hidden = hasMessages;
    elements.messageList.replaceChildren();
    if (hasMessages) {
      const dateLabel = createElement('div', 'day-divider', 'Những điều mình kể hôm nay ♡');
      elements.messageList.append(dateLabel);
      const fragment = document.createDocumentFragment();
      for (const message of state.messages) fragment.append(renderMessage(message));
      elements.messageList.append(fragment);
    }
    elements.downloadBtn.disabled = !hasMessages;
    elements.clearBtn.disabled = !hasMessages;
    elements.moodList.querySelectorAll('[data-mood]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mood === state.mood));
    });
    scrollToBottom();
  }
  function addMessage(role, content) {
    state.messages.push({ role, content, time: Date.now() });
    if (state.messages.length > MAX_SESSION_MESSAGES) state.messages = state.messages.slice(-MAX_SESSION_MESSAGES);
    saveSession();
    render();
  }
  function setPending(next) {
    pending = next;
    elements.typingIndicator.hidden = !next;
    elements.messageInput.disabled = next;
    autoSize();
    if (next) scrollToBottom();
  }
  function sampleReply(userMessage) {
    const text = userMessage.toLowerCase();
    if (/tự tử|tự sát|muốn chết|kết thúc cuộc đời|làm đau bản thân/.test(text)) {
      return 'Nghe cậu nói vậy, mình thật sự muốn cậu được an toàn. Nếu đang có thể làm đau bản thân, cậu hãy đến gần một người tin cậy và liên hệ hỗ trợ khẩn cấp tại nơi mình sống nhé. Cậu có đang ở nơi an toàn lúc này không?';
    }
    if (/mệt|áp lực|công việc|đi làm|kiệt sức/.test(text)) return 'Nghe như cậu đã phải gồng mình suốt một ngày dài. Có phải điều khiến cậu mệt nhất không chỉ là công việc, mà còn là cảm giác chẳng ai hiểu mình?';
    if (/cô đơn|một mình|không ai|lạc lõng/.test(text)) return 'Cảm giác lạc lõng giữa mọi người đôi khi còn buồn hơn ở một mình ấy. Dạo gần đây có chuyện gì khiến cậu thấy xa cách với mọi người không?';
    if (/vui|hạnh phúc|thành công|tốt đẹp/.test(text)) return 'Nghe thấy cậu vui là mình cũng muốn nghe chuyện này thêm một chút. Điều gì đặc biệt đã xảy ra vậy? 🌷';
    if (/buồn|khóc|thất vọng|chia tay/.test(text)) return 'Có những chuyện chỉ nghĩ đến thôi đã thấy nghèn nghẹn rồi. Cậu có muốn kể mình nghe điều khiến cậu buồn nhất không?';
    return 'Ừm, mình đang nghe đây. Chuyện này có vẻ mang nhiều cảm xúc với cậu. Phần nào khiến cậu suy nghĩ nhiều nhất vậy?';
  }
  async function getReply() {
    if (IS_DEMO) {
      await new Promise(resolve => setTimeout(resolve, 850));
      return sampleReply(state.messages.at(-1)?.content || '');
    }
    const messages = state.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    currentController = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, mood: state.mood }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Có chút trục trặc khi kết nối.');
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Chưa nhận được lời hồi đáp.');
      return data.reply.trim();
    } finally {
      clearTimeout(timeoutId);
      if (currentController === controller) currentController = null;
    }
  }
  async function sendMessage(text) {
    const content = String(text || '').trim().slice(0, MAX_CHARACTERS);
    if (!content || pending) return;
    const turn = ++generation;
    addMessage('user', content);
    elements.messageInput.value = '';
    setPending(true);
    try {
      const reply = await getReply();
      if (turn === generation) addMessage('assistant', reply);
    } catch (error) {
      if (turn !== generation) return;
      console.error('Trò chuyện không thành công:', error instanceof Error ? error.message : 'unknown');
      let msg = 'Mình đang gặp một chút trục trặc nên chưa phản hồi được. Cậu thử gửi lại sau nhé. 🌿';
      if (error?.name === 'AbortError') msg = 'Kết nối hơi lâu rồi. Cậu thử gửi lại một chút sau nhé.';
      if (error?.message?.includes('429')) msg = 'Hôm nay có khá nhiều lời tâm sự. Cậu chờ một chút rồi thử lại nhé.';
      addMessage('assistant', msg);
      showToast('Chưa kết nối được. Kiểm tra cấu hình máy chủ hoặc đường truyền nhé.');
    } finally {
      if (turn === generation) {
        setPending(false);
        elements.messageInput.focus();
      }
    }
  }
  function startOver() {
    generation++;
    if (currentController) currentController.abort();
    currentController = null;
    state = { mood: 'neutral', messages: [] };
    saveSession();
    elements.messageInput.value = '';
    setPending(false);
    render();
    elements.clearDialog.close();
    showToast('Đã xóa cuộc trò chuyện trên thiết bị này ♡');
    elements.messageInput.focus();
  }
  function downloadChat() {
    if (!state.messages.length) return;
    const lines = ['MỘT CHÚT BÌNH YÊN', 'Cuộc trò chuyện cá nhân', '––––––––––––––––––––––––––––––––', '',
      ...state.messages.flatMap(m => [`[${formatTime(m.time)}] ${m.role === 'user' ? 'Cậu' : 'Một Chút Bình Yên'}:`, m.content, ''])];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mot-chut-binh-yen-tam-su.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Đã tạo tệp văn bản để cậu lưu riêng.');
  }
  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else showToast('Trình duyệt này không hỗ trợ hộp thoại.');
  }
  function wireEvents() {
    elements.chatForm.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(elements.messageInput.value); });
    elements.messageInput.addEventListener('input', autoSize);
    elements.messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendMessage(elements.messageInput.value);
      }
    });
    elements.moodList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mood]');
      if (!button) return;
      state.mood = button.dataset.mood;
      saveSession();
      render();
      const placeholders = {
        sad: 'Điều gì làm cậu buồn thế...', tired: 'Ngày hôm nay của cậu thế nào...',
        lonely: 'Có chuyện gì khiến cậu thấy cô đơn...', happy: 'Kể mình nghe chuyện vui của cậu...'
      };
      elements.messageInput.placeholder = placeholders[state.mood] || 'Kể mình nghe chuyện của cậu nhé...';
      elements.messageInput.focus();
    });
    document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => {
      elements.messageInput.value = button.dataset.start;
      autoSize();
      elements.messageInput.focus();
    }));
    const onPrivacy = () => openDialog(elements.privacyDialog);
    elements.privacyBtn.addEventListener('click', onPrivacy);
    elements.privacyInline.addEventListener('click', onPrivacy);
    elements.themeBtn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveTheme(next);
    });
    elements.downloadBtn.addEventListener('click', downloadChat);
    elements.clearBtn.addEventListener('click', () => openDialog(elements.clearDialog));
    elements.cancelClear.addEventListener('click', () => elements.clearDialog.close());
    elements.cancelX.addEventListener('click', () => elements.clearDialog.close());
    elements.confirmClear.addEventListener('click', startOver);
    elements.clearDialog.addEventListener('click', event => { if (event.target === elements.clearDialog) elements.clearDialog.close(); });
    elements.privacyDialog.addEventListener('click', event => { if (event.target === elements.privacyDialog) elements.privacyDialog.close(); });
  }

  readSession();
  applyTheme(readTheme() === 'dark' ? 'dark' : 'light');
  elements.demoBanner.hidden = !IS_DEMO;
  if (IS_DEMO) console.info('Một Chút Bình Yên đang chạy chế độ xem thử. Hãy thiết lập API_URL trong config.js để kích hoạt trò chuyện thật.');
  wireEvents();
  render();
  autoSize();
})();
