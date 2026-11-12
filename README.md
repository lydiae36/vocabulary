# 家庭英文單字庫

在首頁的下拉選單選擇自己、兒子或女兒，就能直接開啟對應的單字庫。手機和電腦都從 Cloudflare D1 讀取同一份單字和複習進度。有網站網址的人都可以切換和編輯三個單字庫。

- 手機可拍課本或選照片，辨識結果可以先修改，再一次加入單字。照片在瀏覽器辨識，加入的單字才會送到單字庫。
- 點「發音」先試 Google 語音。若載入失敗，會改用裝置的英文語音。
- 標記已學會後，隔一天開始複習。每次想得起來就拉長間隔，依序為 3、7、14、30、60 和 120 天。忘記時隔一天再試。複習時先自己想意思，再顯示答案。

## 部署

用 Cloudflare Workers 提供網站和 API，D1 儲存資料。

1. 建立 D1 資料庫，將資料庫 ID 寫進 wrangler.jsonc 的 d1_databases，綁定名稱使用 DB。
2. 執行 npx wrangler d1 execute DB --remote --file=schema.sql。
3. 執行 npx wrangler deploy。再從下拉選單切換三個單字庫，確認各自顯示對應的資料。

根目錄的 index.html 是舊站版本。public/index.html 是 Workers 新站。
