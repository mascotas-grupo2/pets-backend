import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPetExpiryWarnedAt1750000004000 implements MigrationInterface {
  name = "AddPetExpiryWarnedAt1750000004000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "expiryWarnedAt" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" DROP COLUMN IF EXISTS "expiryWarnedAt"`,
    );
  }
}
