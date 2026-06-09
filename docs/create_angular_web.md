# 前端重構與並行 Angular 前端之建置計畫

本計畫旨在調整現有的 Monorepo 結構：將既有的 Next.js 前端目錄由 `apps/web/` 更名為 `apps/web-next/`，並在此基礎上於 `apps/web-angular/` 建立一個全新的最新版 Angular 專案，實現雙前端並行對照開發與學習的目的。

---

## User Review Required

> [!IMPORTANT]
> **目錄層級對齊**：
> 為配合現有專案的 **Bun Workspaces** 設定（目前 API 與前端皆位於 `apps/` 下），建議將 `web-next/` 與 `web-angular/` 置於 `apps/` 目錄中（即 `apps/web-next/` 與 `apps/web-angular/`），以保持專案結構的整潔與自動依賴管理。
>
> **CORS 跨來源設定**：
> 後端 API (NestJS) 目前只允許 `localhost:3000` (Next.js) 的跨來源請求。引入 Angular (`localhost:4200`) 後，我們需要調整 NestJS 的 CORS 允許清單。

---

## Open Questions

> [!WARNING]
> 1. **是否啟用 SSR (Server-Side Rendering)**：
>    在建立 Angular 專案時，建議啟用 SSR (`--ssr` 參數)。這能讓您對照學習 Next.js App Router 的 SSR 機制與 Angular SSR (含 Hydration) 的運作方式。是否同意此設定？
> 
> 2. **套件名稱變更**：
>    隨著目錄更名為 `apps/web-next/`，是否同步將 package.json 的套件名稱由 `@booking-scheduler/web` 變更為 `@booking-scheduler/web-next`？這會影響根目錄 package.json 的 script 篩選器 (`--filter`)。

---

## Proposed Changes

### Monorepo 根目錄配置與腳本組件

#### [MODIFY] [package.json](file:///Users/richard/Documents/projects/practice/full-stack/package.json)
* 調整 `workspaces` 配置：將 `"apps/web"` 改為 `"apps/web-next"`，並新增 `"apps/web-angular"`。
* 更新 `scripts` 中 Next.js 的指令名稱與篩選器（將 `"dev:web"` 修改為 `"dev:next"`，指向新套件名稱 `@booking-scheduler/web-next`）。
* 新增 `scripts` 以支援 Angular 專案的啟動、編譯與測試，例如：
  * `"dev:angular": "bun --filter @booking-scheduler/web-angular start"`
  * `"build:angular": "bun --filter @booking-scheduler/web-angular build"`
  * `"test:angular": "bun --filter @booking-scheduler/web-angular test"`

#### [MODIFY] [e2e-start-web.sh](file:///Users/richard/Documents/projects/practice/full-stack/scripts/e2e-start-web.sh)
* 將最後一行的啟動目錄參數改為新的目錄：
  ```bash
  exec npm run dev -w apps/web-next
  ```

---

### Next.js 前端組件 (更名與套件重命名)

#### [DELETE] `apps/web/`
* 整體目錄移動/更名為 `apps/web-next/`。

#### [NEW] `apps/web-next/`
* 接收原 `apps/web/` 的所有程式碼與設定。

#### [MODIFY] [package.json](file:///Users/richard/Documents/projects/practice/full-stack/apps/web-next/package.json)
* 將 `"name"` 欄位由 `"@booking-scheduler/web"` 修改為 `"@booking-scheduler/web-next"`。

---

### Angular 前端組件 (建置新專案)

#### [NEW] `apps/web-angular/`
* 使用 `@angular/cli` 初始化全新 Standalone、Vite-based 的 Angular 專案。
* **初始化命令**：
  ```bash
  bunx @angular/cli new web-angular --directory apps/web-angular --package-manager bun --style css --routing true --ssr true
  ```
* 建立後，將調整 `apps/web-angular/package.json` 中的 `"name"` 欄位為 `"@booking-scheduler/web-angular"`。
* 設定開發代理伺服器 `proxy.conf.json`，將 `/api` 請求代理至 `http://127.0.0.1:3001`，以便與 NestJS API 整合。

---

### NestJS 後端組件 (調整 CORS)

#### [MODIFY] [main.ts](file:///Users/richard/Documents/projects/practice/full-stack/apps/api/src/main.ts)
* 調整 `webOrigins` 陣列，加入 Angular 開發伺服器預設位址，避免 CORS 擋下 API 請求：
  ```typescript
  const webOrigins = Array.from(
    new Set([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
    ]),
  );
  ```

---

## Verification Plan

### Automated Tests
* 驗證 Next.js 能夠正常建置與進行型別檢查：
  ```bash
  bun run build
  bun run typecheck
  ```
* 驗證 Angular 專案基礎編譯通過：
  ```bash
  bun --filter @booking-scheduler/web-angular build
  ```

### Manual Verification
1. **雙前端同時執行測試**：
   * 啟動後端與兩個前端：
     ```bash
     # 分別在三個終端機視窗中執行：
     bun run dev:api
     bun run dev:next
     bun run dev:angular
     ```
   * 訪問 `http://localhost:3000` 確認 Next.js 正常運作。
   * 訪問 `http://localhost:4200` 確認 Angular 預設首頁正常載入。
2. **API 串接測試**：
   * 確認 Angular 端發送 API 請求到 `http://localhost:4200/api/...` 時，能正確由代理轉送至後端 `3001` 埠，且無 CORS 錯誤。
