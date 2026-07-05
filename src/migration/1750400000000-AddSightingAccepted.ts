import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSightingAccepted1750400000000 implements MigrationInterface {
  name = "AddSightingAccepted1750400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "accepted" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "accepted_by_user_id" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "accepted_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "accepted_at"`);
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "accepted"`);
  }
}
