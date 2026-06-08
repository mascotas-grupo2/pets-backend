import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserStatusAndNote1748710000000 implements MigrationInterface {
  name = 'AddUserStatusAndNote1748710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "status_id" integer NOT NULL DEFAULT 511`);
    await queryRunner.query(`ALTER TABLE "user" ADD "evaluation_note" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "evaluation_note"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "status_id"`);
  }
}
