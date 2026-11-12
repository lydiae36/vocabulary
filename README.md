# 家庭英文單字庫

一家人可以共用一個網址。每人用自己的登入碼進入單字庫，手機和電腦會從 Cloudflare D1 讀取同一份單字和複習進度。

- 手機可拍課本或選照片，辨識結果可以先修改，再一次加入單字。照片在瀏覽器辨識，加入的單字才會送到單字庫。
- 點「發音」先試 Google 語音。若載入失敗，會改用裝置的英文語音。
- 標記已學會後，隔一天開始複習。每次想得起來就拉長間隔，依序為 3、7、14、30、60 和 120 天。忘記時隔一天再試。複習時先自己想意思，再顯示答案。
- 舊版的單字存在原瀏覽器。請在原網址用原裝置按「匯出單字 JSON」，再登入新站的「我的單字庫」，選「匯入舊單字」。舊版已學會的單字會排入待複習。

## 部署

用 Cloudflare Workers 提供網站和 API，D1 儲存資料。使用者在網站輸入個人登入碼。Cloudflare Access 不需要套用到這個 Worker。

1. 建立 D1 資料庫，將資料庫 ID 寫進 wrangler.jsonc 的 d1_databases，綁定名稱使用 DB。
2. 執行 npx wrangler d1 execute DB --remote --file=schema.sql。
3. 用 npx wrangler secret put 分別設定 CODE_PARENT、CODE_SON、CODE_DAUGHTER。每人使用不同的高強度隨機登入碼，至少 128 位元隨機性。
4. 執行 npx wrangler deploy。再分別用三個帳號登入，確認資料各自獨立。

根目錄的 index.html 是舊站匯出資料用的版本。public/index.html 是 Workers 新站。
