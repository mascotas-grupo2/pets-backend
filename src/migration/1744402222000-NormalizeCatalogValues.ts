import { MigrationInterface, QueryRunner } from "typeorm";

const catalogValues = [
  [1, "animal_type", "perro", "Perro"],
  [2, "animal_type", "gato", "Gato"],
  [3, "animal_type", "otro", "Otro"],
  [101, "pet_sex", "macho", "Macho"],
  [102, "pet_sex", "hembra", "Hembra"],
  [201, "pet_status", "perdido", "Perdido"],
  [202, "pet_status", "encontrado", "Encontrado"],
  [203, "pet_status", "en tránsito", "En tránsito"],
  [204, "pet_status", "en tratamiento médico", "En tratamiento médico"],
  [205, "pet_status", "en adopción", "En adopción"],
  [206, "pet_status", "adoptado", "Adoptado"],
  [301, "pet_medical_status", "sano", "Sano"],
  [302, "pet_medical_status", "en evaluación", "En evaluación"],
  [303, "pet_medical_status", "en tratamiento", "En tratamiento"],
  [304, "pet_medical_status", "post-operatorio", "Post-operatorio"],
  [305, "pet_medical_status", "recuperándose", "Recuperándose"],
  [306, "pet_medical_status", "crítico", "Crítico"],
  [401, "pet_note_kind", "general", "General"],
  [402, "pet_note_kind", "medica", "Médica"],
  [403, "pet_note_kind", "adopcion", "Adopción"],
  [501, "user_role", "user", "Usuario"],
  [502, "user_role", "admin", "Administrador"],
  [601, "sso_provider", "keycloak", "Keycloak"],
  [701, "yes_no", "si", "Si"],
  [702, "yes_no", "no", "No"],
  [711, "yes_no_na", "si", "Si"],
  [712, "yes_no_na", "no", "No"],
  [713, "yes_no_na", "na", "No aplica"],
  [801, "living_situation", "casa", "Casa"],
  [802, "living_situation", "departamento", "Departamento"],
  [803, "living_situation", "phd", "PHD"],
  [804, "living_situation", "quinta", "Quinta"],
  [805, "living_situation", "otro", "Otro"],
  [901, "household_setting", "urbano", "Urbano"],
  [902, "household_setting", "suburbano", "Suburbano"],
  [903, "household_setting", "rural", "Rural"],
  [1001, "activity_level", "tranquilo", "Tranquilo"],
  [1002, "activity_level", "moderado", "Moderado"],
  [1003, "activity_level", "activo", "Activo"],
];

const petFields = [
  ["animalType", "animalTypeId", "animal_type", null, true],
  ["sex", "sexId", "pet_sex", null, false],
  ["status", "statusId", "pet_status", 201, true],
  ["medicalStatus", "medicalStatusId", "pet_medical_status", 301, true],
] as const;

const adoptionFields = [
  ["preferredAnimal", "preferredAnimalTypeId", "animal_type", "character varying(20)"],
  ["hasGarden", "hasGardenId", "yes_no", "character varying(4)"],
  ["livingSituation", "livingSituationId", "living_situation", "character varying(40)"],
  ["householdSetting", "householdSettingId", "household_setting", "character varying(40)"],
  ["activityLevel", "activityLevelId", "activity_level", "character varying(40)"],
  ["visitingChildren", "visitingChildrenId", "yes_no", "character varying(4)"],
  ["hasFlatmates", "hasFlatmatesId", "yes_no", "character varying(4)"],
  ["otherAnimals", "otherAnimalsId", "yes_no", "character varying(4)"],
  ["neutered", "neuteredId", "yes_no_na", "character varying(4)"],
  ["vaccinated", "vaccinatedId", "yes_no_na", "character varying(4)"],
] as const;

function valuesSql() {
  return catalogValues
    .map(([id, catalog, code, label]) => `(${id}, '${catalog}', '${code}', '${label}')`)
    .join(",\n        ");
}

export class NormalizeCatalogValues1744402222000 implements MigrationInterface {
  name = "NormalizeCatalogValues1744402222000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "catalog_value" (
        "id" integer NOT NULL,
        "catalog" character varying(50) NOT NULL,
        "code" character varying(80) NOT NULL,
        "label" character varying(120) NOT NULL,
        CONSTRAINT "PK_catalog_value_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalog_value_catalog_code" UNIQUE ("catalog", "code")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "catalog_value" ("id", "catalog", "code", "label")
      VALUES
        ${valuesSql()}
    `);

    for (const [oldColumn, newColumn, catalog, defaultId, required] of petFields) {
      await queryRunner.query(`ALTER TABLE "pet" ADD COLUMN "${newColumn}" integer`);
      await queryRunner.query(`
        UPDATE "pet"
        SET "${newColumn}" = cv."id"
        FROM "catalog_value" cv
        WHERE cv."catalog" = '${catalog}' AND cv."code" = "pet"."${oldColumn}"::text
      `);
      if (defaultId) {
        await queryRunner.query(`UPDATE "pet" SET "${newColumn}" = ${defaultId} WHERE "${newColumn}" IS NULL`);
        await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "${newColumn}" SET DEFAULT ${defaultId}`);
      }
      if (required) {
        await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "${newColumn}" SET NOT NULL`);
      }
      await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "${oldColumn}"`);
      await queryRunner.query(`
        ALTER TABLE "pet"
        ADD CONSTRAINT "FK_pet_${newColumn}_catalog_value"
        FOREIGN KEY ("${newColumn}") REFERENCES "catalog_value"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    await queryRunner.query(`ALTER TABLE "pet_note" ADD COLUMN "kindId" integer`);
    await queryRunner.query(`
      UPDATE "pet_note"
      SET "kindId" = cv."id"
      FROM "catalog_value" cv
      WHERE cv."catalog" = 'pet_note_kind' AND cv."code" = "pet_note"."kind"::text
    `);
    await queryRunner.query(`UPDATE "pet_note" SET "kindId" = 401 WHERE "kindId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "pet_note" ALTER COLUMN "kindId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pet_note" ALTER COLUMN "kindId" SET DEFAULT 401`);
    await queryRunner.query(`ALTER TABLE "pet_note" DROP COLUMN IF EXISTS "kind"`);
    await queryRunner.query(`
      ALTER TABLE "pet_note"
      ADD CONSTRAINT "FK_pet_note_kindId_catalog_value"
      FOREIGN KEY ("kindId") REFERENCES "catalog_value"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    for (const [oldColumn, newColumn, catalog] of adoptionFields) {
      await queryRunner.query(`ALTER TABLE "adoption" ADD COLUMN "${newColumn}" integer`);
      await queryRunner.query(`
        UPDATE "adoption"
        SET "${newColumn}" = cv."id"
        FROM "catalog_value" cv
        WHERE cv."catalog" = '${catalog}'
          AND "adoption"."${oldColumn}" IS NOT NULL
          AND "adoption"."${oldColumn}" <> ''
          AND cv."code" = "adoption"."${oldColumn}"
      `);
      await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN IF EXISTS "${oldColumn}"`);
      await queryRunner.query(`
        ALTER TABLE "adoption"
        ADD CONSTRAINT "FK_adoption_${newColumn}_catalog_value"
        FOREIGN KEY ("${newColumn}") REFERENCES "catalog_value"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "role_id" integer`);
    await queryRunner.query(`
      UPDATE "user"
      SET "role_id" = cv."id"
      FROM "catalog_value" cv
      WHERE cv."catalog" = 'user_role' AND cv."code" = "user"."role"::text
    `);
    await queryRunner.query(`UPDATE "user" SET "role_id" = 501 WHERE "role_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role_id" SET DEFAULT 501`);

    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "sso_provider_id" integer`);
    await queryRunner.query(`
      UPDATE "user"
      SET "sso_provider_id" = cv."id"
      FROM "catalog_value" cv
      WHERE cv."catalog" = 'sso_provider'
        AND "user"."sso_provider" IS NOT NULL
        AND cv."code" = "user"."sso_provider"
    `);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "sso_provider"`);
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD CONSTRAINT "FK_user_role_id_catalog_value"
      FOREIGN KEY ("role_id") REFERENCES "catalog_value"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD CONSTRAINT "FK_user_sso_provider_id_catalog_value"
      FOREIGN KEY ("sso_provider_id") REFERENCES "catalog_value"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pet_animaltype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pet_sex_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pet_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pet_medical_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pet_note_kind_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_role_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "FK_user_sso_provider_id_catalog_value"`);
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "FK_user_role_id_catalog_value"`);
    await queryRunner.query(`ALTER TABLE "pet_note" DROP CONSTRAINT IF EXISTS "FK_pet_note_kindId_catalog_value"`);
    for (const [, newColumn] of adoptionFields) {
      await queryRunner.query(`ALTER TABLE "adoption" DROP CONSTRAINT IF EXISTS "FK_adoption_${newColumn}_catalog_value"`);
    }
    for (const [, newColumn] of petFields) {
      await queryRunner.query(`ALTER TABLE "pet" DROP CONSTRAINT IF EXISTS "FK_pet_${newColumn}_catalog_value"`);
    }

    await queryRunner.query(`CREATE TYPE "public"."pet_animaltype_enum" AS ENUM('perro', 'gato', 'otro')`);
    await queryRunner.query(`CREATE TYPE "public"."pet_sex_enum" AS ENUM('macho', 'hembra')`);
    await queryRunner.query(`
      CREATE TYPE "public"."pet_status_enum" AS ENUM(
        'perdido',
        'encontrado',
        'en tránsito',
        'en tratamiento médico',
        'en adopción',
        'adoptado'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."pet_medical_status_enum" AS ENUM(
        'sano',
        'en evaluación',
        'en tratamiento',
        'post-operatorio',
        'recuperándose',
        'crítico'
      )
    `);
    await queryRunner.query(`CREATE TYPE "public"."pet_note_kind_enum" AS ENUM('general', 'medica', 'adopcion')`);
    await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('user', 'admin')`);

    const petOldTypes = new Map([
      ["animalType", `"public"."pet_animaltype_enum"`],
      ["sex", `"public"."pet_sex_enum"`],
      ["status", `"public"."pet_status_enum"`],
      ["medicalStatus", `"public"."pet_medical_status_enum"`],
    ]);
    for (const [oldColumn, newColumn, , defaultId, required] of petFields) {
      const oldType = petOldTypes.get(oldColumn)!;
      await queryRunner.query(`ALTER TABLE "pet" ADD COLUMN "${oldColumn}" ${oldType}`);
      await queryRunner.query(`
        UPDATE "pet"
        SET "${oldColumn}" = cv."code"::${oldType}
        FROM "catalog_value" cv
        WHERE "pet"."${newColumn}" = cv."id"
      `);
      if (defaultId) {
        const defaultCode = oldColumn === "status" ? "perdido" : "sano";
        await queryRunner.query(`UPDATE "pet" SET "${oldColumn}" = '${defaultCode}' WHERE "${oldColumn}" IS NULL`);
        await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "${oldColumn}" SET DEFAULT '${defaultCode}'`);
      }
      if (required) {
        await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "${oldColumn}" SET NOT NULL`);
      }
      await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "${newColumn}"`);
    }

    await queryRunner.query(`ALTER TABLE "pet_note" ADD COLUMN "kind" "public"."pet_note_kind_enum"`);
    await queryRunner.query(`
      UPDATE "pet_note"
      SET "kind" = cv."code"::"public"."pet_note_kind_enum"
      FROM "catalog_value" cv
      WHERE "pet_note"."kindId" = cv."id"
    `);
    await queryRunner.query(`UPDATE "pet_note" SET "kind" = 'general' WHERE "kind" IS NULL`);
    await queryRunner.query(`ALTER TABLE "pet_note" ALTER COLUMN "kind" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pet_note" ALTER COLUMN "kind" SET DEFAULT 'general'`);
    await queryRunner.query(`ALTER TABLE "pet_note" DROP COLUMN IF EXISTS "kindId"`);

    for (const [oldColumn, newColumn, catalog, type] of adoptionFields) {
      await queryRunner.query(`ALTER TABLE "adoption" ADD COLUMN "${oldColumn}" ${type}`);
      await queryRunner.query(`
        UPDATE "adoption"
        SET "${oldColumn}" = cv."code"
        FROM "catalog_value" cv
        WHERE cv."catalog" = '${catalog}' AND "adoption"."${newColumn}" = cv."id"
      `);
      await queryRunner.query(`ALTER TABLE "adoption" DROP COLUMN IF EXISTS "${newColumn}"`);
    }

    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "role" "public"."user_role_enum"`);
    await queryRunner.query(`
      UPDATE "user"
      SET "role" = cv."code"::"public"."user_role_enum"
      FROM "catalog_value" cv
      WHERE "user"."role_id" = cv."id"
    `);
    await queryRunner.query(`UPDATE "user" SET "role" = 'user' WHERE "role" IS NULL`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "sso_provider" character varying(40)`);
    await queryRunner.query(`
      UPDATE "user"
      SET "sso_provider" = cv."code"
      FROM "catalog_value" cv
      WHERE "user"."sso_provider_id" = cv."id"
    `);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "role_id"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "sso_provider_id"`);

    await queryRunner.query(`DROP TABLE "catalog_value"`);
  }
}
