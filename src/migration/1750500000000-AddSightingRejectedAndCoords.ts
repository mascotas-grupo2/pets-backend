import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSightingRejectedAndCoords1750500000000
  implements MigrationInterface
{
  name = "AddSightingRejectedAndCoords1750500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "rejected" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "rejected_by_user_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "latitud" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "sighting" ADD COLUMN IF NOT EXISTS "longitud" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "longitud"`);
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "latitud"`);
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "rejected_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "rejected_at"`);
    await queryRunner.query(`ALTER TABLE "sighting" DROP COLUMN IF EXISTS "rejected"`);
  }
}
