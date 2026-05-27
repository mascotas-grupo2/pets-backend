import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordReset1744402219000 implements MigrationInterface {
  name = "AddPasswordReset1744402219000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "password_reset_token_hash" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "user" ADD "password_reset_expires_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "password_reset_expires_at"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "password_reset_token_hash"`);
  }
}
