import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessageTable1748700000000 implements MigrationInterface {
  name = "AddMessageTable1748700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "message" (
        "id" SERIAL NOT NULL,
        "senderId" integer NOT NULL,
        "receiverId" integer NOT NULL,
        "content" text NOT NULL,
        "read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_message_senderId" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_message_receiverId" FOREIGN KEY ("receiverId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_message_senderId" ON "message" ("senderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_message_receiverId" ON "message" ("receiverId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_message_receiverId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_message_senderId"`);
    await queryRunner.query(`DROP TABLE "message"`);
  }
}
