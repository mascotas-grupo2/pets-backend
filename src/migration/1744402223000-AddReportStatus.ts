import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReportStatus1744402223000 implements MigrationInterface {
  name = "AddReportStatus1744402223000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (1101, 'pet_report_status', 'pendiente', 'Pendiente'),
      (1102, 'pet_report_status', 'activo', 'Activo'),
      (1103, 'pet_report_status', 'finalizado', 'Finalizado')
    `);

    await queryRunner.query(`ALTER TABLE "pet" ADD COLUMN "reportStatusId" integer`);
    await queryRunner.query(`UPDATE "pet" SET "reportStatusId" = 1101 WHERE "reportStatusId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "reportStatusId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "reportStatusId" SET DEFAULT 1101`);
    await queryRunner.query(`
      ALTER TABLE "pet"
      ADD CONSTRAINT "FK_pet_reportStatusId_catalog_value"
      FOREIGN KEY ("reportStatusId") REFERENCES "catalog_value"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" DROP CONSTRAINT IF EXISTS "FK_pet_reportStatusId_catalog_value"`);
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "reportStatusId"`);
    await queryRunner.query(`DELETE FROM "catalog_value" WHERE "id" IN (1101,1102,1103)`);
  }
}
