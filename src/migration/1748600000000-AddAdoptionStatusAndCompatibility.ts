import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionStatusAndCompatibility1748600000000 implements MigrationInterface {
  name = "AddAdoptionStatusAndCompatibility1748600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "adoption" ADD "status" character varying(40) NOT NULL DEFAULT 'NUEVA'`,
    );
    await queryRunner.query(
      `ALTER TABLE "adoption" ADD "compatibilityScore" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_adoption_status" ON "adoption" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_adoption_userId" ON "adoption" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_adoption_petId" ON "adoption" ("petId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_adoption_compatibilityScore" ON "adoption" ("compatibilityScore")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_adoption_compatibilityScore"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_adoption_petId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_adoption_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_adoption_status"`);
    await queryRunner.query(
      `ALTER TABLE "adoption" DROP COLUMN "compatibilityScore"`,
    );
    await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN "status"`);
  }
}
