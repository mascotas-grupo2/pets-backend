import { MigrationInterface, QueryRunner } from "typeorm";

export class WidenUserPhoto1744402216000 implements MigrationInterface {
  name = "WidenUserPhoto1744402216000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "photo" TYPE text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "photo" TYPE varchar(500)`,
    );
  }
}
