type MyBookingDetailPageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export const dynamic = 'force-dynamic';

// 顯示我的預約詳情骨架，私人資料頁先固定為 dynamic 避免共享快取。
export default async function MyBookingDetailPage({ params }: MyBookingDetailPageProps) {
  const { bookingId } = await params;

  return (
    <main className="page">
      <section className="card">
        <h1>預約詳情</h1>
        <p>預約 ID：{bookingId}</p>
        <p>Phase 4 會串接詳情、取消預約與取消限制錯誤處理。</p>
      </section>
    </main>
  );
}
