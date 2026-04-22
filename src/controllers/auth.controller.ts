import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { User } from "../entity/User.js";
import { registerSchema, loginSchema } from "../schemas/auth.schema.js";
import crypto from "crypto";

function userRepo() {
  return AppDataSource.getRepository(User);
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, email, password } = parsed.data;
  const existing = await userRepo().findOneBy({ email });
  if (existing) return res.status(409).json({ error: "Email ya registrado" });

  const { salt, hash } = hashPassword(password);
  const user = userRepo().create({ name, email, passwordHash: hash, passwordSalt: salt });
  const saved = await userRepo().save(user);
  // Do not return password fields
  const { passwordHash, passwordSalt, ...safe } = saved as any;
  res.status(201).json(safe);
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const existing = await userRepo().findOneBy({ email });
  if (!existing) return res.status(401).json({ error: "Credenciales invalidas" });

  const hash = crypto.pbkdf2Sync(password, existing.passwordSalt, 310000, 32, "sha256").toString("hex");
  if (hash !== existing.passwordHash) return res.status(401).json({ error: "Credenciales invalidas" });

  const { passwordHash, passwordSalt, ...safe } = existing as any;
  res.json(safe);
}
