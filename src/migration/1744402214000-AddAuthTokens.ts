import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuthTokens1744402214000 implements MigrationInterface {
  name = "AddAuthTokens1744402214000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "refresh_token_hash" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "user" ADD "email_verified" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "user" ADD "email_verification_token_hash" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "user" ADD "sso_provider" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "user" ADD "sso_subject" character varying(200)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_sso_provider_subject" ON "user" ("sso_provider", "sso_subject") WHERE "sso_provider" IS NOT NULL AND "sso_subject" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_user_sso_provider_subject"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "sso_subject"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "sso_provider"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "email_verification_token_hash"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "email_verified"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "refresh_token_hash"`);
  }
}
