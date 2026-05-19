import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminAuditLogs1700000003000 implements MigrationInterface {
  name = 'CreateAdminAuditLogs1700000003000';

  // 建立後台重要操作需要的 audit_logs 表與查詢索引。
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(100) NOT NULL,
        target_type varchar(100) NOT NULL,
        target_id uuid,
        metadata jsonb,
        ip_address inet,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX audit_logs_actor_user_id_created_at_idx ON audit_logs (actor_user_id, created_at DESC)');
    await queryRunner.query('CREATE INDEX audit_logs_target_type_target_id_idx ON audit_logs (target_type, target_id)');
    await queryRunner.query('CREATE INDEX audit_logs_action_created_at_idx ON audit_logs (action, created_at DESC)');
  }

  // 回復時先移除索引，再移除 audit_logs 表。
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX audit_logs_action_created_at_idx');
    await queryRunner.query('DROP INDEX audit_logs_target_type_target_id_idx');
    await queryRunner.query('DROP INDEX audit_logs_actor_user_id_created_at_idx');
    await queryRunner.query('DROP TABLE audit_logs');
  }
}
