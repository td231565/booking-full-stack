import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublicServiceCatalog1700000001000 implements MigrationInterface {
  name = 'CreatePublicServiceCatalog1700000001000';

  // 建立公開服務瀏覽需要的 enum、資料表、索引與開發驗證資料。
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE TYPE service_status AS ENUM ('active', 'inactive', 'hidden')");
    await queryRunner.query("CREATE TYPE availability_slot_status AS ENUM ('available', 'blocked', 'inactive')");
    await queryRunner.query(`
      CREATE TABLE services (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        description text,
        image_url text,
        duration_minutes integer NOT NULL,
        price integer NOT NULL,
        status service_status NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT services_duration_minutes_positive CHECK (duration_minutes > 0),
        CONSTRAINT services_price_non_negative CHECK (price >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE availability_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        status availability_slot_status NOT NULL DEFAULT 'available',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT availability_slots_end_after_start CHECK (end_at > start_at)
      )
    `);
    await queryRunner.query('CREATE INDEX services_status_idx ON services (status)');
    await queryRunner.query('CREATE INDEX availability_slots_service_id_start_at_idx ON availability_slots (service_id, start_at)');
    await queryRunner.query('CREATE INDEX availability_slots_start_at_status_idx ON availability_slots (start_at, status)');
    await queryRunner.query(`
      WITH inserted_services AS (
        INSERT INTO services (name, description, image_url, duration_minutes, price, status)
        VALUES
          ('個人諮詢', '一對一諮詢服務，適合需要完整討論與規劃的使用者。', NULL, 60, 1200, 'active'),
          ('團隊諮詢', '團隊導入與流程討論服務，目前暫停接受新預約。', NULL, 90, 3000, 'inactive'),
          ('內部測試服務', '此服務只供後台測試，公開 API 不應回傳。', NULL, 30, 0, 'hidden')
        RETURNING id, name, duration_minutes, status
      )
      INSERT INTO availability_slots (service_id, start_at, end_at, status)
      SELECT
        id,
        date_trunc('hour', now()) + interval '2 days' + interval '9 hours',
        date_trunc('hour', now()) + interval '2 days' + interval '9 hours' + make_interval(mins => duration_minutes),
        'available'::availability_slot_status
      FROM inserted_services
      WHERE status = 'active'
      UNION ALL
      SELECT
        id,
        date_trunc('hour', now()) + interval '2 days' + interval '11 hours',
        date_trunc('hour', now()) + interval '2 days' + interval '11 hours' + make_interval(mins => duration_minutes),
        'blocked'::availability_slot_status
      FROM inserted_services
      WHERE status = 'active'
    `);
  }

  // 回復時依關聯順序移除公開服務瀏覽相關資料表與 enum。
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX availability_slots_start_at_status_idx');
    await queryRunner.query('DROP INDEX availability_slots_service_id_start_at_idx');
    await queryRunner.query('DROP INDEX services_status_idx');
    await queryRunner.query('DROP TABLE availability_slots');
    await queryRunner.query('DROP TABLE services');
    await queryRunner.query('DROP TYPE availability_slot_status');
    await queryRunner.query('DROP TYPE service_status');
  }
}
