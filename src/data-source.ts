import "reflect-metadata";
import { DataSource } from "typeorm";
import { Mascota } from "./entity/Mascota.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [Mascota],
  migrations: ["dist/migration/*.js"],
  synchronize: false,
});
