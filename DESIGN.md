# Design

## Theme

淺色 product UI。使用者在日間室內光線下瀏覽與預約，需要高可讀性與低視覺噪音。

## Color Strategy

Restrained：暖色調中性底 + 單一 accent（墨綠 `accent`）用於主要動作與連結焦點，占比約 8–10%。

## Palette (OKLCH)

| Token | 用途 |
|-------|------|
| `surface` | 頁面背景 |
| `elevated` | 卡片、導覽列 |
| `ink` | 主要文字 |
| `ink-muted` | 次要文字 |
| `border` | 分隔線 |
| `accent` | 主要按鈕、連結 |
| `accent-hover` | 按鈕 hover |
| `success` / `success-bg` | 可預約狀態 |
| `warning` / `warning-bg` | 暫停、提示 |
| `danger` | 錯誤、取消相關 |

## Typography

- 英文/UI：`IBM Plex Sans`
- 中文：`Noto Sans TC`
- 標題與內文層次比 ≥ 1.25；內文行長上限約 65ch

## Components

- `Page` / `PageHeader`：統一頁寬與標題區
- `Button` / `ButtonLink`：主要與次要動作
- `Badge`：服務/預約狀態
- `FormField` / `TextInput`：表單
- `Notice`：非阻斷提示
- `ListRow`：時段與預約列表列
- `StatusState`：loading / empty / error

## Motion

- 僅 opacity、transform；150–200ms ease-out
- `prefers-reduced-motion: reduce` 時關閉
