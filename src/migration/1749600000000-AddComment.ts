import { MigrationInterface, QueryRunner } from "typeorm";

export class AddComment1749600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "comment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "petId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "section" varchar(60) NOT NULL DEFAULT 'general',
        "content" text NOT NULL,
        "approved" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comment_id" PRIMARY KEY ("id")
      )
    `);

    // Índices para consultas rápidas
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_petId" ON "comment" ("petId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_petId_approved" ON "comment" ("petId", "approved")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_comment_petId_approved"`);
    await queryRunner.query(`DROP INDEX "IDX_comment_petId"`);
    await queryRunner.query(`DROP TABLE "comment"`);
  }
}
