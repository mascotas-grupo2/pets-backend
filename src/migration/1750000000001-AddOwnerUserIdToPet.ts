import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOwnerUserIdToPet1750000000001 implements MigrationInterface {
  name = "AddOwnerUserIdToPet1750000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "ownerUserId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "ownerUserId"`);
  }
}
