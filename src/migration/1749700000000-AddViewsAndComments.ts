import { MigrationInterface, QueryRunner } from "typeorm";

export class AddViewsAndComments1749700000000 implements MigrationInterface {
  name = "AddViewsAndComments1749700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Conteo de vistas en la publicación.
    await queryRunner.query(
      `ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "viewsCount" integer NOT NULL DEFAULT 0`,
    );

    // Comentarios públicos moderados por el dueño.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_comment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pet_id" uuid NOT NULL,
        "author_user_id" integer,
        "author_name" character varying(120) NOT NULL,
        "author_email" character varying(200),
        "text" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pet_comment_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_comment_pet" ON "pet_comment" ("pet_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_pet_comment_pet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_comment"`);
    await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "viewsCount"`);
  }
}
