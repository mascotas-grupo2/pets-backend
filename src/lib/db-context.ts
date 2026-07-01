import { AsyncLocalStorage } from "node:async_hooks";
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../data-source.js";

export const RLS_ENABLED = process.env.RLS_ENABLED === "true";
export const RLS_APP_ROLE = process.env.RLS_APP_ROLE ?? "pets_app";

const storage = new AsyncLocalStorage<{ manager: EntityManager }>();

export function dbManager(): EntityManager {
  return storage.getStore()?.manager ?? AppDataSource.manager;
}

export function runWithManager(manager: EntityManager, fn: () => void): void {
  storage.run({ manager }, fn);
}
