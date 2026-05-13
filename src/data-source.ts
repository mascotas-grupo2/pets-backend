import "reflect-metadata";
import { DataSource } from "typeorm";
import { Pet } from "./entity/Pet.js";
import { User } from "./entity/User.js";
import { InitPetTable1744402212000 } from "./migration/1744402212000-Init.js";
import { AddUser1744402213000 } from "./migration/1744402213000-AddUser.js";
import { AddAuthTokens1744402214000 } from "./migration/1744402214000-AddAuthTokens.js";
import { AddPetCoordinates1744402215000 } from "./migration/1744402215000-AddPetCoordinates.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [Pet, User],
  migrations: [InitPetTable1744402212000, AddUser1744402213000, AddAuthTokens1744402214000, AddPetCoordinates1744402215000],
  synchronize: false,
});
