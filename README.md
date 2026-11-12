# 家庭英文單字庫

每人點自己的專屬連結就能進入單字庫。手機和電腦都從 Cloudflare D1 讀取同一份單字和複習進度。

- 手機可拍課本或選照片，辨識結果可以先修改，再一次加入單字。照片在瀏覽器辨識，加入的單字才會送到單字庫。
- 點「發音」先試 Google 語音。若載入失敗，會改用裝置的英文語音。
- 標記已學會後，隔一天開始複習。每次想得起來就拉長間隔，依序為 3、7、14、30、60 和 120 天。忘記時隔一天再試。複習時先自己想意思，再顯示答案。

## 部署

用 Cloudflare Workers 提供網站和 API，D1 儲存資料。網站開啟時會用專屬連結登入，並把登入資訊從網址列移除。Cloudflare Access 不需要套用到這個 Worker。

1. 建立 D1 資料庫，將資料庫 ID 寫進 wrangler.jsonc 的 d1_databases，綁定名稱使用 DB。
2. 執行 npx wrangler d1 execute DB --remote --file=schema.sql。
3. 用 npx wrangler secret put 分別設定 CODE_PARENT、CODE_SON、CODE_DAUGHTER。每人使用不同的高強度隨機登入碼，至少 128 位元隨機性。

專屬連結格式為 `https://你的網站/#profile=parent&code=登入碼`。把 `parent` 換成對應的 `son` 或 `daughter`，並使用各自的登入碼。知道連結的人就能進入該單字庫，請分開分享。
4. 執行 npx wrangler deploy。再分別用三個帳號登入，確認資料各自獨立。

根目錄的 index.html 是舊站版本。public/index.html 是 Workers 新站。
