# 🌷 Một Chút Bình Yên — Website tâm sự ẩn danh

Một website trò chuyện tối giản, nhẹ nhàng, tập trung lắng nghe. Giao diện không dán nhãn **AI** vào tên hay bong bóng chat; dòng cuối trang giải thích minh bạch rằng đây là **người bạn trò chuyện tự động, không phải người thật**.

## Những gì đã có

- Giao diện desktop và mobile, sáng/tối, không thư viện, không cần đăng nhập.
- Chọn tâm trạng: buồn, mệt, cô đơn, vui; gợi ý câu bắt đầu.
- Tin nhắn trả lời 2–4 câu theo cấu hình, tự nhiên, giữ ngữ cảnh 12 tin gần nhất.
- Tạm giữ tin nhắn trong `sessionStorage` của tab trình duyệt; **không có cơ sở dữ liệu chat**.
- Tải chat `.txt`, xóa chat, thông báo quyền riêng tư, chặn spam cơ bản.
- API key nằm ở Cloudflare Worker, **không** nằm trong mã nguồn website.
- `store: false` trong lời gọi OpenAI Responses API.

## A. Xem thử ngay, chưa cần khóa API

1. Giải nén.
2. Mở `web/index.html` bằng trình duyệt hoặc mở bằng local server (khuyến nghị):

   ```bash
   cd web
   python -m http.server 5500
   ```

   Sau đó mở `http://localhost:5500`.
3. Mặc định sẽ có dải thông báo **"Đang xem thử giao diện"**. Những câu phản hồi thử chỉ là ví dụ có sẵn, **chưa phải AI thật**.

## B. Bật chat AI thật (Cloudflare Worker + OpenAI API)

Cần tài khoản Cloudflare và **OpenAI API key có hạn mức thanh toán riêng**; ChatGPT Plus không cung cấp sẵn chi phí API.

1. Vào thư mục `worker` và cài Wrangler (yêu cầu Node.js):

   ```bash
   cd worker
   npm install
   npx wrangler login
   ```

2. Mở `worker/wrangler.jsonc`. Sửa `ALLOWED_ORIGINS` thành danh sách **nguồn trang web thật** (chỉ domain và giao thức, KHÔNG thêm đường dẫn):

   ```json
   "ALLOWED_ORIGINS": "https://TEN-TAI-KHOAN.github.io,https://ten-mien-cua-ban.dev,http://localhost:5500"
   ```

   Nếu website được đăng lên GitHub Pages dạng `https://TEN-TAI-KHOAN.github.io/ten-repo/`, origin vẫn chỉ là `https://TEN-TAI-KHOAN.github.io`.

3. Triển khai Worker lần đầu (chưa có khóa nên endpoint chat sẽ trả trạng thái cần thiết lập):

   ```bash
   npm run deploy
   ```

   Lưu URL được Wrangler báo, ví dụ:
   `https://mot-chut-binh-yen-api.TEN-TAI-KHOAN.workers.dev`

4. Đưa API key vào **secret** của Worker (không bao giờ đưa vào `web/config.js`, HTML hoặc GitHub):

   ```bash
   npx wrangler secret put OPENAI_API_KEY
   ```

   Dán khóa vào terminal khi được hỏi. Lệnh này cập nhật và triển khai secret. Cũng có thể đặt secret trong Cloudflare Dashboard → Workers & Pages → chọn Worker → Settings → Variables and Secrets → Add → Secret.

5. Mở `web/config.js`, sửa đúng **một dòng**:

   ```js
   window.BINH_YEN_CONFIG = {
     API_URL: "https://mot-chut-binh-yen-api.TEN-TAI-KHOAN.workers.dev/chat"
   };
   ```

6. Tải lại trang: dòng **"Đang xem thử giao diện"** biến mất, và phản hồi được tạo bằng mô hình thật.

**Thay giọng nói:** Mở `worker/src/index.mjs`, sửa `SYSTEM_INSTRUCTIONS` (không cần chỉnh giao diện). Đổi mô hình bằng `AI_MODEL` ở `wrangler.jsonc` nếu muốn.

## C. Đăng lên GitHub Pages (không ảnh hưởng website cũ)

1. Tạo **repository mới**, ví dụ `mot-chut-binh-yen`.
2. Chỉ đưa **nội dung bên trong thư mục `web/`** lên root của repository mới, gồm `index.html`, `styles.css`, `app.js`, `config.js`, `favicon.svg`.
3. GitHub → repository mới → Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
4. Website sẽ có dạng `https://TEN-TAI-KHOAN.github.io/mot-chut-binh-yen/`.
5. Nếu đã mua tên miền `.dev`, cấu hình custom domain trong Pages và DNS theo tài liệu của GitHub. `.dev` phải sử dụng HTTPS. Nhớ thêm `https://ten-mien.dev` vào `ALLOWED_ORIGINS` của Worker và deploy lại.

> Không phải tải Worker hoặc file `.dev.vars` lên repository public. GitHub Pages chỉ cần 5 file trong `web/`.

## D. Quyền riêng tư, an toàn và chi phí

- Website không đăng nhập và không cài analytics. Tin nhắn được **lưu tạm trong sessionStorage của chính tab**; có thể được khôi phục nếu trình duyệt khôi phục tab. Nút xóa chat xóa dữ liệu phiên hiện tại. Tải `.txt` chỉ khi người dùng chủ động chọn.
- Khi dùng chat thật, tối đa 12 tin nhắn gần nhất (trong giới hạn 14.000 ký tự) được gửi tới Worker rồi chuyển cho nhà cung cấp mô hình. `store:false` yêu cầu Responses API không lưu đối tượng phản hồi; **không có nghĩa là mọi dữ liệu trên đường truyền/hệ thống cung cấp dịch vụ tuyệt đối không được lưu vì các lý do khác**.
- Mã nguồn Worker không ghi cuộc trò chuyện vào cơ sở dữ liệu hoặc log, nhưng hạ tầng Cloudflare và nhà cung cấp API có chính sách riêng. Đừng tự quảng cáo "bảo mật tuyệt đối".
- Có 2 lớp rate limiting Cloudflare: 12 lần/phút theo IP (có thể ảnh hưởng người dùng dùng chung mạng) và 60 lần/phút chung toàn site. Chúng là giới hạn **xấp xỉ**, không đủ làm hạn mức chi phí tuyệt đối. Với website công khai, nên bổ sung Cloudflare Turnstile, giám sát chi phí và đặt mức chi tiêu/cảnh báo trong trang quản lý API.
- Web không thay thế chuyên gia tâm lý hoặc dịch vụ khẩn cấp. Hệ thống có hướng dẫn phản hồi an toàn với tín hiệu khủng hoảng.
- Không chèn OpenAI API key vào bất kỳ file client nào.

## E. Kiểm thử

```bash
cd worker
npm test
```

Kiểm tra tương thích giao diện bằng Chrome/Edge (PC và mobile) trước khi dùng công khai.

## Tài liệu chính thức

- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare rate limiting: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- GitHub Pages: https://docs.github.com/en/pages
