import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFollowupStatusCompletado1749300000000 implements MigrationInterface {
  name = "AddFollowupStatusCompletado1749300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (1313, 'followup_status', 'COMPLETADO', 'Completado')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "catalog_value" WHERE "id" = 1313`);
  }
}
