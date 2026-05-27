import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPetCoordinates1744402215000 implements MigrationInterface {
  name = "AddPetCoordinates1744402215000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" ADD "latitud" double precision`);
    await queryRunner.query(`ALTER TABLE "pet" ADD "longitud" double precision`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN "longitud"`);
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN "latitud"`);
  }
}
