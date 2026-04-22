import "reflect-metadata";
import { DataSource } from "typeorm";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [Pet, User],
  migrations: ["dist/migration/*.js"],
  synchronize: false,
});
