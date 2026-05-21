import { DataSource } from 'typeorm';

let dataSource: DataSource | undefined;

// 取得共用 DataSource，整合測試需直接查詢 DB 驗證 audit log 與 status log。
async function getDataSource(): Promise<DataSource> {
  if (!dataSource) {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
    });
    await dataSource.initialize();
  }

  return dataSource;
}

// 關閉測試用 DataSource，避免 afterAll 後連線池殘留。
export async function closeTestDataSource(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
    dataSource = undefined;
  }
}

// 執行單一 SQL 查詢並回傳第一列第一欄字串結果。
export async function queryScalar(sql: string): Promise<string> {
  const ds = await getDataSource();
  const rows: Array<Record<string, string>> = await ds.query(sql);
  const firstRow = rows[0];

  if (!firstRow) {
    return '';
  }

  return String(Object.values(firstRow)[0] ?? '');
}

// 將指定 email 的使用者升級為 admin，供 Admin API 整合測試使用。
export async function promoteUserToAdmin(email: string): Promise<void> {
  const ds = await getDataSource();
  await ds.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email.trim().toLowerCase()]);
}

// 查詢 audit_logs 是否已有指定 action 紀錄。
export async function hasAuditLog(action: string): Promise<boolean> {
  const count = await queryScalar(
    `SELECT COUNT(*)::text FROM audit_logs WHERE action = '${action.replace(/'/g, "''")}'`,
  );

  return Number(count) > 0;
}
