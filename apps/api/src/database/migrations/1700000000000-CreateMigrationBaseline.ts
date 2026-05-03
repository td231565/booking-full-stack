import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMigrationBaseline1700000000000 implements MigrationInterface {
  name = 'CreateMigrationBaseline1700000000000';

  // 建立 PostgreSQL UUID 產生能力，後續資料表 migration 可共用 gen_random_uuid()。
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  // 回復 baseline 時移除目前階段唯一建立的資料庫 extension。
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "pgcrypto"');
  }
}
