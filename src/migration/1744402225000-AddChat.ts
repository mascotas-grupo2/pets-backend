import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChat1744402225000 implements MigrationInterface {
  name = "AddChat1744402225000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "conversation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subject" varchar(200) NOT NULL,
        "context" varchar(160) NOT NULL,
        "channel" varchar(16) NOT NULL DEFAULT 'usuario',
        "petName" varchar(120),
        "lastMessageAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "conversation_participant" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversationId" uuid NOT NULL,
        "userId" integer,
        "displayName" varchar(120) NOT NULL,
        "email" varchar(120),
        "phone" varchar(40),
        "role" varchar(16) NOT NULL DEFAULT 'member',
        "lastReadAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_participant_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_participant_conversation_user" UNIQUE ("conversationId", "userId"),
        CONSTRAINT "FK_participant_conversation"
          FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_participant_conversationId" ON "conversation_participant" ("conversationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_participant_userId" ON "conversation_participant" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "message" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversationId" uuid NOT NULL,
        "senderUserId" integer,
        "senderName" varchar(120) NOT NULL,
        "text" text NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_message_conversation"
          FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_message_conversationId" ON "message" ("conversationId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "message"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_participant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation"`);
  }
}
