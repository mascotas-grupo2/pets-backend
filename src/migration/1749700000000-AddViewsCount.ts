import { MigrationInterface, QueryRunner } from "typeorm";

export class AddViewsCount1749700000000 implements MigrationInterface {
  name = "AddViewsCount1749700000000";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "pet" ADD COLUMN "viewsCount" integer NOT NULL DEFAULT 0`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "pet" DROP COLUMN "viewsCount"`);
  }
}
