# DCS — Double Check System

DCS đọc và đối chiếu bộ chứng từ FCL/LCL trong trình duyệt. Bản dùng để triển khai nằm trong [ban-dang-chay-v4/](ban-dang-chay-v4/).

## Triển khai bằng GitHub Pages

1. Trên GitHub, vào **Settings → Pages → Build and deployment**. Chọn **GitHub Actions** ở mục **Source**.
2. Push commit chứa [workflow triển khai](.github/workflows/deploy-pages.yml) lên nhánh `main`. GitHub sẽ tự chạy workflow.
3. Khi workflow hoàn tất, mở **Settings → Pages → Visit site**. Với cấu hình mặc định của repo này, địa chỉ sẽ là [nvhs414-afk.github.io/Dashboard-system-check/](https://nvhs414-afk.github.io/Dashboard-system-check/).

Các lần push sau vào `main` sẽ tự động chạy kiểm thử, build và triển khai. Để chạy thủ công, vào **Actions → Deploy DCS to GitHub Pages → Run workflow** và chọn `main`.

Workflow dùng Node.js 24 và xuất bản nội dung trong `ban-dang-chay-v4/dist/`, gồm trang HTML, JavaScript, PDF worker và tài nguyên giao diện. [Hướng dẫn GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Chạy và kiểm thử tại máy

Từ thư mục gốc của repo, chạy các lệnh sau với Node.js 24 và Python 3.

```sh
cd ban-dang-chay-v4
npm ci
npm test
npm run build
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Mở [localhost:8000](http://localhost:8000/). Trên Windows, có thể dùng `py` thay cho `python`. OCR cho tài liệu dạng ảnh tải thư viện và dữ liệu ngôn ngữ qua mạng.

## Cấu trúc repo

- `ban-dang-chay-v4/src/` chứa mã đọc chứng từ, trích xuất, đối chiếu và phần giao diện tương tác.
- `ban-dang-chay-v4/tests/` chứa các bài kiểm thử chạy bằng `npm test`.
- `ban-dang-chay-v4/dist/` là thư mục được GitHub Pages phục vụ. Sửa HTML và CSS tại đây. Sau khi sửa mã trong `src/`, chạy `npm run build` để cập nhật bundle JavaScript.
- `.github/workflows/deploy-pages.yml` chứa quy trình build và triển khai.
