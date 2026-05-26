import "dotenv/config";
import crypto from "crypto";
import { AppDataSource } from "./data-source.js";
import { User, UserRole } from "./entity/User.js";

/**
 * Alta manual de un usuario (sin pasar por el flujo de verificación por email).
 * Uso: tsx src/create-user.ts <email> <password> [nombre] [user|admin]
 */
async function main() {
  const [, , email, password, name = "Usuario", roleArg = "user"] = process.argv;

  if (!email || !password) {
    console.error("Uso: tsx src/create-user.ts <email> <password> [nombre] [user|admin]");
    process.exit(1);
  }

  const role = roleArg === "admin" ? UserRole.ADMIN : UserRole.USER;

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto
    .pbkdf2Sync(password, salt, 310000, 32, "sha256")
    .toString("hex");

  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    existing.name = name;
    existing.passwordHash = passwordHash;
    existing.passwordSalt = salt;
    existing.role = role;
    existing.emailVerified = true;
    const user = await repo.save(existing);
    console.log(
      `Usuario actualizado: ${user.email} (id=${user.id}, role=${user.role}, emailVerified=${user.emailVerified}) — contraseña reseteada.`,
    );
  } else {
    const user = await repo.save(
      repo.create({
        name,
        email,
        passwordHash,
        passwordSalt: salt,
        role,
        emailVerified: true,
      }),
    );
    console.log(
      `Usuario creado: ${user.email} (id=${user.id}, role=${user.role}, emailVerified=${user.emailVerified})`,
    );
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
