# Tạo file APK Togie Valley (không cần Android Studio)

1. Tạo tài khoản GitHub, tạo repository mới (Private cũng được), rồi tải TOÀN BỘ thư mục dự án lên nhánh `main`
   (nhớ cả thư mục ẩn `.github`; nếu kéo thả trên web không thấy nó, hãy dùng GitHub Desktop).
2. Vào tab **Actions** của repo, bấm nút xanh "I understand my workflows, go ahead and enable them" nếu được hỏi.
3. Mỗi lần đẩy code lên `main` máy chủ sẽ tự build. Muốn build tay: Actions > **Build Android APK** > **Run workflow**.
4. Đợi khoảng 5-10 phút đến khi có dấu tích xanh. Bấm vào lần chạy đó, kéo xuống mục **Artifacts**,
   tải **Togie-Valley-apk** (file .zip), giải nén ra `app-debug.apk`.
5. Chép file APK sang điện thoại. Mở file, nếu máy hỏi thì cho phép "Cài đặt ứng dụng không rõ nguồn", rồi bấm Cài đặt.

## Nhạc nền
- Bỏ các file `01.mp3`, `02.mp3`, ... vào thư mục `music/` TRƯỚC khi đẩy code lên GitHub (hoặc thêm `playlist.json`).
- Toàn bộ MP3 được đóng gói vào APK, nên dung lượng APK gần bằng tổng dung lượng MP3 cộng khoảng 10 MB.
  10 bài x 4 MB = APK khoảng 50 MB. Nên nén MP3 ở 96-128 kbps và chỉ giữ vài bài.

## Icon ứng dụng
- Mọi icon (PWA, favicon, apple-touch, maskable, Android legacy/tròn/adaptive) đều sinh từ MỘT ảnh gốc 1024 px bằng `python3 tools/gen_icon.py` (chỉ cần Pillow). Sửa hình trong file đó rồi chạy lại.
- Ảnh Android nằm ở `icons/android/mipmap-*`; `tools/android_patch.js` tự chép vào `android/app/src/main/res` và tạo adaptive icon, nên APK và PWA luôn giống nhau.
- Sau khi đổi icon, tăng `VERSION` trong `sw.js` để trình duyệt tải icon mới.

## Ký APK: debug và release
- APK tạo ra là bản **debug**, ký bằng khóa debug tự động: cài thẳng vào máy được, dùng để chơi và thử nghiệm.
- Muốn đưa lên Google Play cần bản **release** có khóa ký riêng (keystore) và tệp AAB; việc này chưa có trong workflow.
  Giữ kỹ khóa đó: mất khóa là không cập nhật được app.

## Lỗi hay gặp
- **Không thấy workflow trong Actions**: thiếu thư mục `.github/workflows` hoặc chưa đẩy lên nhánh `main`.
- **Bước "Build www" lỗi HTTP/fetch**: GitHub không tải được three.js hoặc font; bấm Re-run jobs là thường qua.
- **Bước `cap add android` hoặc `android_patch` lỗi**: xem dòng đỏ trong log, thường do `package.json` hoặc `capacitor.config.json` bị sửa sai.
- **Bước gradle lỗi bộ nhớ/hết dung lượng**: MP3 quá nặng, hãy giảm bớt.
- **Cài APK báo "ứng dụng chưa được cài"**: gỡ bản cũ (khóa debug khác nhau) rồi cài lại.
