import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMemberBookingFlow1700000002000 implements MigrationInterface {
  name = 'CreateMemberBookingFlow1700000002000';

  // 建立會員登入與預約流程需要的 enum、資料表、索引與一致性限制。
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE TYPE user_role AS ENUM ('user', 'admin')");
    await queryRunner.query("CREATE TYPE user_status AS ENUM ('active', 'disabled')");
    await queryRunner.query("CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'completed')");
    await queryRunner.query("CREATE TYPE booking_cancelled_by AS ENUM ('user', 'admin')");
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL,
        password_hash text NOT NULL,
        display_name varchar(100) NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        status user_status NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE bookings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
        availability_slot_id uuid NOT NULL REFERENCES availability_slots(id) ON DELETE RESTRICT,
        status booking_status NOT NULL DEFAULT 'confirmed',
        note text,
        cancelled_at timestamptz,
        cancelled_by booking_cancelled_by,
        cancel_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE booking_status_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        from_status booking_status,
        to_status booking_status NOT NULL,
        changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email))');
    await queryRunner.query('CREATE UNIQUE INDEX sessions_session_token_hash_unique_idx ON sessions (session_token_hash)');
    await queryRunner.query('CREATE INDEX sessions_user_id_expires_at_idx ON sessions (user_id, expires_at)');
    await queryRunner.query('CREATE INDEX bookings_user_id_created_at_idx ON bookings (user_id, created_at DESC)');
    await queryRunner.query(
      "CREATE UNIQUE INDEX bookings_availability_slot_active_unique_idx ON bookings (availability_slot_id) WHERE status <> 'cancelled'",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX bookings_user_slot_active_unique_idx ON bookings (user_id, availability_slot_id) WHERE status <> 'cancelled'",
    );
  }

  // 回復時依關聯順序移除會員登入與預約流程相關資料表、索引與 enum。
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX bookings_user_slot_active_unique_idx');
    await queryRunner.query('DROP INDEX bookings_availability_slot_active_unique_idx');
    await queryRunner.query('DROP INDEX bookings_user_id_created_at_idx');
    await queryRunner.query('DROP INDEX sessions_user_id_expires_at_idx');
    await queryRunner.query('DROP INDEX sessions_session_token_hash_unique_idx');
    await queryRunner.query('DROP INDEX users_email_unique_idx');
    await queryRunner.query('DROP TABLE booking_status_logs');
    await queryRunner.query('DROP TABLE bookings');
    await queryRunner.query('DROP TABLE sessions');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TYPE booking_cancelled_by');
    await queryRunner.query('DROP TYPE booking_status');
    await queryRunner.query('DROP TYPE user_status');
    await queryRunner.query('DROP TYPE user_role');
  }
}
