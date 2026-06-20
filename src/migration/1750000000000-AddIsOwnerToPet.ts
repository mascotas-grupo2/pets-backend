import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsOwnerToPet1750000000000 implements MigrationInterface {
  name = "AddIsOwnerToPet1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "isOwner" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "isOwner"`);
  }
}
