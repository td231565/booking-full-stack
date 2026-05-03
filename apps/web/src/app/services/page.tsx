import Link from 'next/link';
import { EmptyState } from '@/components/ui/status-state';

// 顯示服務列表頁骨架，Phase 3 會改為串接 GET /api/services。
export default function ServicesPage() {
  return (
    <main className="page">
      <h1>服務列表</h1>
      <div className="grid">
        <section className="card">
          <h2>公開服務卡片</h2>
          <p>此區塊會顯示 active 與 inactive 服務，hidden 服務不會出現。</p>
          <Link href="/services/demo-service">查看範例詳情</Link>
        </section>
        <EmptyState title="尚未載入服務資料" description="Phase 3 會串接公開服務 API。" />
      </div>
    </main>
  );
}
