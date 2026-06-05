# CodiumAI/Qodo PR-Agent 設定完成說明

我們已經完成了 `pr-agent` 自動化 AI Code Review 工作流的設定，並在專案中建立了對應的 GitHub Actions 設定檔。

## 異動成果與說明

### 1. 建立 GitHub Action 設定檔
我們新建了設定檔：[.github/workflows/pr-agent.yml](file:///Users/richard/Documents/projects/practice/full-stack/.github/workflows/pr-agent.yml)

### 2. 核心設定亮點

#### A. 預設使用 **Gemini 3.1 Pro**
* **效能**：`gemini-3.1-pro` 特別為 Agentic Coding 任務進行了優化，並擴展了輸出 Token 限制，比 `gemini-2.5-pro` 更能掌握跨檔案的複雜程式邏輯，提供高品質、深入的審查建議。
* **價格**：3.1 Pro 的價格只比 Flash 貴約 33%（每百萬輸入 tokens 為 $2.00 vs $1.50），在程式碼審查這種需要強大推理的場景中，使用 3.1 Pro 的性價比非常高。
* **自訂彈性**：如果您需要調整，只需直接編輯 [pr-agent.yml](file:///Users/richard/Documents/projects/practice/full-stack/.github/workflows/pr-agent.yml) 中的 `config.model` 即可隨時切換至 `gemini/gemini-2.5-pro` 或 `gemini/gemini-3.5-flash`。

#### C. 多元觸發機制 (PR Label + Push + 留言指令)
我們設定了以下觸發流程：
1. 當您建立 Pull Request，且在 GitHub 上為該 PR 加上 **`ai-review`** 標籤（Label）時，GitHub Actions 會被觸發並由 PR-Agent 使用 Gemini 3.1 Pro 進行首次 Code Review、PR 描述生成與改進建議。
2. 當 PR 已標記有 `ai-review` 時，若開發者後續又推動 (push/synchronize) 新的 commit 到該 PR 分支，會自動再次觸發 Code Review，確保新上傳的程式碼也會受到審查。
3. **留言指令互動**：在已加上 `ai-review` 標籤的 PR 中，您可以在留言區直接輸入 PR-Agent 的指令（例如 `/improve`、`/review` 等），系統會自動偵測並在討論區回覆您。

#### D. 安全最小權限原則
* 我們已將 `contents` 權限由原本官方範例的 `write` 降級為 **`read`**。這意味著 AI 只有讀取程式碼的權限，不具備直接對您的專案分支提交 commit 的寫入權限，提升了安全性。

---

## 3. 使用前準備與操作指南

> [!IMPORTANT]
> 1. **GitHub Secret 確認**：請確認您已經在 Repository 的 `Settings > Secrets and variables > Actions` 中，新增了一個 Repository Secret 叫 **`GEMINI_API_KEY`**。
> 2. **GitHub Label 建立**：您需要在 GitHub Repository 中先建立一個名為 **`ai-review`** 的 Label（可在 Pull Request 的 Labels 設定區塊中建立）。
> 3. **如何觸發審查**：
>    - 建立 Pull Request。
>    - 在 PR 右側的 **Labels** 欄位，勾選或加上 **`ai-review`**。
>    - GitHub Actions 即會自動啟動，並在審查完畢後將結果直接以評論形式發表在 PR 的對話中。
> 4. **如何使用留言指令互動**：
>    - 在已經貼上 `ai-review` 標籤的 PR 留言區中，輸入 `/improve` 後送出評論。
>    - GitHub Actions 就會被喚醒，並以正體中文回覆該指令。 (您也可以使用 `/review` 重新審查、`/describe` 重新生成摘要等)。
