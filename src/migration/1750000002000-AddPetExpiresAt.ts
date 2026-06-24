import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPetExpiresAt1750000002000 implements MigrationInterface {
  name = "AddPetExpiresAt1750000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "expiresAt"`);
  }
}
