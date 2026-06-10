import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSeguimientos1748600101000 implements MigrationInterface {
  name = "AddSeguimientos1748600101000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seguimientos" (
        "id" SERIAL NOT NULL,
        "pet_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "type_id" integer NOT NULL,
        "status_id" integer NOT NULL DEFAULT 1311,
        "appointment_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seguimientos_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_seguimientos_pet_id" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_seguimientos_user_id" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_seguimientos_type_id_catalog_value" FOREIGN KEY ("type_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_seguimientos_status_id_catalog_value" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_seguimientos_pet_id" ON "seguimientos" ("pet_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_seguimientos_user_id" ON "seguimientos" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_seguimientos_type_id" ON "seguimientos" ("type_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_seguimientos_status_id" ON "seguimientos" ("status_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_seguimientos_appointment_at" ON "seguimientos" ("appointment_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_seguimientos_appointment_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_seguimientos_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_seguimientos_type_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_seguimientos_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_seguimientos_pet_id"`);
    await queryRunner.query(`DROP TABLE "seguimientos"`);
  }
}
