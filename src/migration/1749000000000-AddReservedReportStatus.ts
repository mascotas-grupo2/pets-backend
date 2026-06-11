import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReservedReportStatus1749000000000
  implements MigrationInterface
{
  name = "AddReservedReportStatus1749000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (1105, 'pet_report_status', 'reservada', 'Reservada')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Las publicaciones reservadas vuelven a "activo" para no romper la FK.
    await queryRunner.query(
      `UPDATE "pet" SET "reportStatusId" = 1102 WHERE "reportStatusId" = 1105`,
    );
    await queryRunner.query(`DELETE FROM "catalog_value" WHERE "id" = 1105`);
  }
}
