import type { NextFunction, Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { RLS_APP_ROLE, RLS_ENABLED, runWithManager } from "../lib/db-context.js";
import { getAuthUserFromToken, getRequestToken } from "../lib/auth.js";

export async function tenantContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!RLS_ENABLED) return next();

  let refugioId: number | null = null;
  let isSuperadmin = false;
  try {
    const token = getRequestToken(req);
    const authUser = token ? await getAuthUserFromToken(token) : null;
    if (authUser?.role === "superadmin") {
      isSuperadmin = true;
    } else if (authUser) {
      refugioId = authUser.refugioId ?? null;
    }
  } catch {
    refugioId = null;
  }

  const runner = AppDataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL ROLE "${RLS_APP_ROLE}"`);
    await runner.query("SELECT set_config('app.current_refugio', $1, true)", [
      refugioId != null ? String(refugioId) : "",
    ]);
    await runner.query("SELECT set_config('app.is_superadmin', $1, true)", [
      isSuperadmin ? "on" : "off",
    ]);
  } catch (err) {
    try {
      if (!runner.isReleased) await runner.release();
    } catch {}
    return next(err as Error);
  }

  let settled = false;
  const settle = async (commit: boolean) => {
    if (settled) return;
    settled = true;
    try {
      if (runner.isTransactionActive) {
        if (commit) await runner.commitTransaction();
        else await runner.rollbackTransaction();
      }
    } catch {
    } finally {
      try {
        if (!runner.isReleased) await runner.release();
      } catch {}
    }
  };

  res.on("finish", () => void settle(true));
  res.on("close", () => void settle(res.writableEnded));

  runWithManager(runner.manager, () => next());
}
