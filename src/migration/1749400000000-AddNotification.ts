import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotification1749400000000 implements MigrationInterface {
  name = "AddNotification1749400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "type" character varying(40) NOT NULL,
        "title" character varying(160) NOT NULL,
        "body" text,
        "link" character varying(200),
        "read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_userId" ON "notification" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_user_read" ON "notification" ("userId", "read")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_notification_user_read"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_notification_userId"`);
    await queryRunner.query(`DROP TABLE "notification"`);
  }
}
