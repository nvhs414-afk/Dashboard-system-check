# DCS — Double Check System

Mã nguồn website kiểm tra bộ chứng từ FCL/LCL.

| Thư mục | Phiên bản |
| --- | --- |
| `ban-moi-nhat/` | Bản mã nguồn đã lưu tại commit `e9aa0d1`, có bộ OCR tiếng Việt và tiếng Anh trong `dist/ocr/`. |
| `ban-dang-chay-v4/` | Phiên bản 4 đang phát hành tại https://ui-dcs-fcl-flow-20261125.bigiguana7.chatgpt.site/. Commit `4a232a6`. |

## Chạy bản có sẵn

Giải nén ZIP rồi mở Terminal trong thư mục phiên bản muốn thử. Dùng Python 3 để phục vụ thư mục web.

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Mở http://localhost:8000/. Trên Windows, có thể thay `python` bằng `py`. Nếu máy có Node.js và npm, có thể dùng `npx serve dist`. OCR của phiên bản 4 tải thư viện qua mạng.

## Sửa mã và build lại

`src/` chứa mã đọc chứng từ, trích xuất trường và đối chiếu. Giao diện HTML và CSS nằm ở `dist/index.html` và `dist/styles.css`.

```sh
npm ci
npm run build
```

Trong `ban-moi-nhat/`, dùng `node --test tests/extraction.test.js` để kiểm tra bộ trích xuất. Gói mã nguồn bỏ cấu hình liên kết với dự án đang phát hành để nhóm có thể sử dụng độc lập.
