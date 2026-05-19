import "reflect-metadata";
import { DataSource } from "typeorm";
import { Pet } from "./entity/Pet.js";
import { PetNote } from "./entity/PetNote.js";
import { User } from "./entity/User.js";
import { Adoption } from "./entity/Adoption.js";
import { InitPetTable1744402212000 } from "./migration/1744402212000-Init.js";
import { AddUser1744402213000 } from "./migration/1744402213000-AddUser.js";
import { AddAuthTokens1744402214000 } from "./migration/1744402214000-AddAuthTokens.js";
import { AddPetCoordinates1744402215000 } from "./migration/1744402215000-AddPetCoordinates.js";
import { AddAdoption1744402216000 } from "./migration/1744402216000-AddAdoption.js";
import { RemoveUserAdoptionFields1744402217000 } from "./migration/1744402217000-RemoveUserAdoptionFields.js";
import { WidenUserPhoto1744402216000 } from "./migration/1744402216000-WidenUserPhoto.js";
import { AddPetStatusAndNotes1744402217000 } from "./migration/1744402217000-AddPetStatusAndNotes.js";
import { AddMedicalStatusAndNoteKind1744402218000 } from "./migration/1744402218000-AddMedicalStatusAndNoteKind.js";
import { AddPasswordReset1744402219000 } from "./migration/1744402219000-AddPasswordReset.js";
import { AddAdoptionPetId1744402220000 } from "./migration/1744402220000-AddAdoptionPetId.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [Pet, User, Adoption, PetNote],
  migrations: [
    InitPetTable1744402212000,
    AddUser1744402213000,
    AddAuthTokens1744402214000,
    AddPetCoordinates1744402215000,
    AddAdoption1744402216000,
    RemoveUserAdoptionFields1744402217000,
    WidenUserPhoto1744402216000,
    AddPetStatusAndNotes1744402217000,
    AddMedicalStatusAndNoteKind1744402218000,
    AddPasswordReset1744402219000,
    AddAdoptionPetId1744402220000,
  ],
  synchronize: false,
});
