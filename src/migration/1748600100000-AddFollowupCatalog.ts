import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFollowupCatalog1748600100000 implements MigrationInterface {
  name = "AddFollowupCatalog1748600100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (1301, 'followup_type', 'PROGRAMADO', 'Programado'),
      (1302, 'followup_type', 'MEDICO', 'Medico'),
      (1303, 'followup_type', 'VISITA', 'Visita'),
      (1304, 'followup_type', 'URGENTE', 'Urgente'),
      (1305, 'followup_type', 'CONTROL', 'Control'),
      (1306, 'followup_type', 'POST_ADOPCION', 'Post adopcion'),
      (1311, 'followup_status', 'PENDIENTE', 'Pendiente'),
      (1312, 'followup_status', 'CONFIRMADO', 'Confirmado')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "catalog_value" WHERE "id" IN (1301,1302,1303,1304,1305,1306,1311,1312)`
    );
  }
}
