import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionPetId1744402220000 implements MigrationInterface {
  name = "AddAdoptionPetId1744402220000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "adoption" ADD "petId" uuid`);
    await queryRunner.query(`CREATE INDEX "IDX_adoption_petId" ON "adoption" ("petId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_adoption_petId"`);
    await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN "petId"`);
  }
}
