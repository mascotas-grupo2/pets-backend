import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionUpdatedAt1749100000000 implements MigrationInterface {
  name = "AddAdoptionUpdatedAt1749100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "adoption" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    // Las solicitudes existentes nunca se modificaron: igualamos updated_at a created_at.
    await queryRunner.query(`UPDATE "adoption" SET "updated_at" = "created_at"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN "updated_at"`);
  }
}
