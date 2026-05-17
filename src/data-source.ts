import "reflect-metadata";
import { DataSource } from "typeorm";
import { Pet } from "./entity/Pet.js";
import { PetNote } from "./entity/PetNote.js";
import { User } from "./entity/User.js";
import { InitPetTable1744402212000 } from "./migration/1744402212000-Init.js";
import { AddUser1744402213000 } from "./migration/1744402213000-AddUser.js";
import { AddAuthTokens1744402214000 } from "./migration/1744402214000-AddAuthTokens.js";
import { AddPetCoordinates1744402215000 } from "./migration/1744402215000-AddPetCoordinates.js";
import { WidenUserPhoto1744402216000 } from "./migration/1744402216000-WidenUserPhoto.js";
import { AddPetStatusAndNotes1744402217000 } from "./migration/1744402217000-AddPetStatusAndNotes.js";
import { AddMedicalStatusAndNoteKind1744402218000 } from "./migration/1744402218000-AddMedicalStatusAndNoteKind.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [Pet, User, PetNote],
  migrations: [InitPetTable1744402212000, AddUser1744402213000, AddAuthTokens1744402214000, AddPetCoordinates1744402215000, WidenUserPhoto1744402216000, AddPetStatusAndNotes1744402217000, AddMedicalStatusAndNoteKind1744402218000],
  synchronize: false,
});
