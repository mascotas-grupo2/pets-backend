import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRejectedReportStatus1744402224000
  implements MigrationInterface
{
  name = "AddRejectedReportStatus1744402224000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (1104, 'pet_report_status', 'rechazado', 'Rechazado')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Si quedaron publicaciones rechazadas, las dejamos como pendientes para no romper la FK.
    await queryRunner.query(
      `UPDATE "pet" SET "reportStatusId" = 1101 WHERE "reportStatusId" = 1104`,
    );
    await queryRunner.query(
      `DELETE FROM "catalog_value" WHERE "id" = 1104`,
    );
  }
}
