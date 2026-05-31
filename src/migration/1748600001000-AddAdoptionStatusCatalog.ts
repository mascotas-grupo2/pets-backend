import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionStatusCatalog1748600001000 implements MigrationInterface {
  name = "AddAdoptionStatusCatalog1748600001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id","catalog","code","label") VALUES
      (1201, 'adoption_status', 'NUEVA', 'Nueva'),
      (1202, 'adoption_status', 'EN_EVALUACION', 'En evaluacion'),
      (1203, 'adoption_status', 'ENTREVISTA_PENDIENTE', 'Entrevista pendiente'),
      (1204, 'adoption_status', 'ACEPTADA_CON_SEGUIMIENTO', 'Aceptada con seguimiento'),
      (1205, 'adoption_status', 'ACEPTADA', 'Aceptada'),
      (1206, 'adoption_status', 'DESCARTADA', 'Descartada')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "catalog_value" WHERE "id" IN (1201,1202,1203,1204,1205,1206)`
    );
  }
}
