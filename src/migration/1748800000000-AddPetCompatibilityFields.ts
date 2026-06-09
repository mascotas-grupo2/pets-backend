import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPetCompatibilityFields1748800000000 implements MigrationInterface {
  name = "AddPetCompatibilityFields1748800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" ADD "friendlyWithPets" boolean`);
    await queryRunner.query(`ALTER TABLE "pet" ADD "activityLevelId" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN "activityLevelId"`);
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN "friendlyWithPets"`);
  }
}
