import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdoptionStatusFk1748600002000 implements MigrationInterface {
  name = "AddAdoptionStatusFk1748600002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "adoption" ADD COLUMN "statusId" integer`);
    await queryRunner.query(`
      UPDATE "adoption"
      SET "statusId" = cv."id"
      FROM "catalog_value" cv
      WHERE cv."catalog" = 'adoption_status'
        AND cv."code" = "adoption"."status"
    `);
    await queryRunner.query(`UPDATE "adoption" SET "statusId" = 1201 WHERE "statusId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "adoption" ALTER COLUMN "statusId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "adoption" ALTER COLUMN "statusId" SET DEFAULT 1201`);
    await queryRunner.query(`
      ALTER TABLE "adoption"
      ADD CONSTRAINT "FK_adoption_statusId_catalog_value"
      FOREIGN KEY ("statusId") REFERENCES "catalog_value"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_adoption_status"`);
    await queryRunner.query(`CREATE INDEX "IDX_adoption_statusId" ON "adoption" ("statusId")`);
    await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN IF EXISTS "status"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "adoption" ADD COLUMN "status" character varying(40)`);
    await queryRunner.query(`
      UPDATE "adoption"
      SET "status" = cv."code"
      FROM "catalog_value" cv
      WHERE "adoption"."statusId" = cv."id"
    `);
    await queryRunner.query(`UPDATE "adoption" SET "status" = 'NUEVA' WHERE "status" IS NULL`);
    await queryRunner.query(`ALTER TABLE "adoption" ALTER COLUMN "status" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "adoption" ALTER COLUMN "status" SET DEFAULT 'NUEVA'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_adoption_statusId"`);
    await queryRunner.query(
      `ALTER TABLE "adoption" DROP CONSTRAINT IF EXISTS "FK_adoption_statusId_catalog_value"`
    );
    await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN IF EXISTS "statusId"`);
    await queryRunner.query(`CREATE INDEX "IDX_adoption_status" ON "adoption" ("status")`);
  }
}
