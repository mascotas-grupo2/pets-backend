import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Persistencia del chatbot: chat_session + chat_message.
 *
 * Decisiones:
 * - session.id es UUID generado por la API (no auto-increment), para mantener
 *   compatibilidad con el contrato anterior que ya usaba randomUUID().
 * - user_id nullable (sesiones anónimas).
 * - message.session_id con ON DELETE CASCADE: si borramos una sesión, sus
 *   mensajes se van con ella. No queremos mensajes huérfanos.
 * - tool_calls como JSONB para poder indexar/queriarlo después si hace falta.
 */
export class AddChatSession1748800000000 implements MigrationInterface {
  name = "AddChatSession1748800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_session" (
        "id" uuid NOT NULL,
        "user_id" integer,
        "last_intent" varchar(80),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_session" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_session_user" ON "chat_session" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_message" (
        "id" SERIAL NOT NULL,
        "session_id" uuid NOT NULL,
        "role" varchar(20) NOT NULL,
        "content" text,
        "tool_call_id" varchar(80),
        "tool_calls" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_message" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_message_session" ON "chat_message" ("session_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_message"
      ADD CONSTRAINT "FK_chat_message_session"
      FOREIGN KEY ("session_id") REFERENCES "chat_session"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_session"`);
    await queryRunner.query(`DROP INDEX "IDX_chat_message_session"`);
    await queryRunner.query(`DROP TABLE "chat_message"`);
    await queryRunner.query(`DROP INDEX "IDX_chat_session_user"`);
    await queryRunner.query(`DROP TABLE "chat_session"`);
  }
}
