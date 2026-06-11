import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameEncontradoLabel1749000100000
  implements MigrationInterface
{
  name = "RenameEncontradoLabel1749000100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "catalog_value" SET "label" = 'En refugio' WHERE "catalog" = 'pet_status' AND "code" = 'encontrado'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "catalog_value" SET "label" = 'Encontrado' WHERE "catalog" = 'pet_status' AND "code" = 'encontrado'`,
    );
  }
}
