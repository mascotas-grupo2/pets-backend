import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPetExpiryNotifiedAt1750000003000 implements MigrationInterface {
  name = "AddPetExpiryNotifiedAt1750000003000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "expiryNotifiedAt" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" DROP COLUMN IF EXISTS "expiryNotifiedAt"`,
    );
  }
}
