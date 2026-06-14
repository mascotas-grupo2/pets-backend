import "reflect-metadata";
import { DataSource } from "typeorm";
import { Pet } from "./entity/Pet.js";
import { PetNote } from "./entity/PetNote.js";
import { User } from "./entity/User.js";
import { Adoption } from "./entity/Adoption.js";
import { CatalogValue } from "./entity/CatalogValue.js";
import { Followup } from "./entity/Followup.js";
import { Message } from "./entity/Message.js";
import { ChatSession } from "./entity/ChatSession.js";
import { ChatMessage } from "./entity/ChatMessage.js";
import { AdoptionCheck } from "./entity/AdoptionCheck.js";
import { AdoptionNote } from "./entity/AdoptionNote.js";
import { Notification } from "./entity/Notification.js";
import { PetComment } from "./entity/PetComment.js";
import { InitPetTable1744402212000 } from "./migration/1744402212000-Init.js";
import { AddUser1744402213000 } from "./migration/1744402213000-AddUser.js";
import { AddAuthTokens1744402214000 } from "./migration/1744402214000-AddAuthTokens.js";
import { AddPetCoordinates1744402215000 } from "./migration/1744402215000-AddPetCoordinates.js";
import { AddAdoption1744402216000 } from "./migration/1744402216000-AddAdoption.js";
import { WidenUserPhoto1744402216001 } from "./migration/1744402216001-WidenUserPhoto.js";
import { RemoveUserAdoptionFields1744402217001 } from "./migration/1744402217001-RemoveUserAdoptionFields.js";
import { AddPetStatusAndNotes1744402217002 } from "./migration/1744402217002-AddPetStatusAndNotes.js";
import { AddMedicalStatusAndNoteKind1744402218000 } from "./migration/1744402218000-AddMedicalStatusAndNoteKind.js";
import { AddPasswordReset1744402219000 } from "./migration/1744402219000-AddPasswordReset.js";
import { AddAdoptionPetId1744402220000 } from "./migration/1744402220000-AddAdoptionPetId.js";
import { NormalizeCatalogValues1744402222000 } from "./migration/1744402222000-NormalizeCatalogValues.js";
import { AddReportStatus1744402223000 } from "./migration/1744402223000-AddReportStatus.js";
import { AddRejectedReportStatus1744402224000 } from "./migration/1744402224000-AddRejectedReportStatus.js";
import { AddReservedReportStatus1749000000000 } from "./migration/1749000000000-AddReservedReportStatus.js";
import { RenameEncontradoLabel1749000100000 } from "./migration/1749000100000-RenameEncontradoLabel.js";
import { AddAdoptionStatusAndCompatibility1748600000000 } from "./migration/1748600000000-AddAdoptionStatusAndCompatibility.js";
import { AddAdoptionStatusCatalog1748600001000 } from "./migration/1748600001000-AddAdoptionStatusCatalog.js";
import { AddAdoptionStatusFk1748600002000 } from "./migration/1748600002000-AddAdoptionStatusFk.js";
import { AddFollowupCatalog1748600100000 } from "./migration/1748600100000-AddFollowupCatalog.js";
import { AddSeguimientos1748600101000 } from "./migration/1748600101000-AddSeguimientos.js";
import { AddMessageTable1748700000000 } from "./migration/1748700000000-AddMessageTable.js";
import { AddUserStatusAndNote1748710000000 } from "./migration/1748710000000-AddUserStatusAndNote.js";
import { AddPetCompatibilityFields1748800000000 } from "./migration/1748800000000-AddPetCompatibilityFields.js";
import { AddChatSession1748900000000 } from "./migration/1748900000000-AddChatSession.js";
import { AddAdoptionUpdatedAt1749100000000 } from "./migration/1749100000000-AddAdoptionUpdatedAt.js";
import { AddAdoptionEvaluation1749200000000 } from "./migration/1749200000000-AddAdoptionEvaluation.js";
import { AddFollowupStatusCompletado1749300000000 } from "./migration/1749300000000-AddFollowupStatusCompletado.js";
import { AddNotification1749400000000 } from "./migration/1749400000000-AddNotification.js";
import { Comment } from "./entity/Comment.js";
import { AddComment1749600000000 } from "./migration/1749600000000-AddComment.js";
import { AddViewsCount1749700000000 } from "./migration/1749700000000-AddViewsCount.js";
import { AddMessagePhoto1749500000000 } from "./migration/1749500000000-AddMessagePhoto.js";
import { AddAdoptionKind1749600000000 } from "./migration/1749600000000-AddAdoptionKind.js";
import { AddViewsAndComments1749700000000 } from "./migration/1749700000000-AddViewsAndComments.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [
    Pet,
    User,
    Adoption,
    PetNote,
    CatalogValue,
    Followup,
    Message,
    ChatSession,
    ChatMessage,
    AdoptionCheck,
    AdoptionNote,
    Notification,
    PetComment,
  ],
  migrations: [
    InitPetTable1744402212000,
    AddUser1744402213000,
    AddAuthTokens1744402214000,
    AddPetCoordinates1744402215000,
    AddAdoption1744402216000,
    WidenUserPhoto1744402216001,
    RemoveUserAdoptionFields1744402217001,
    AddPetStatusAndNotes1744402217002,
    AddMedicalStatusAndNoteKind1744402218000,
    AddPasswordReset1744402219000,
    AddAdoptionPetId1744402220000,
    NormalizeCatalogValues1744402222000,
    AddReportStatus1744402223000,
    AddRejectedReportStatus1744402224000,
    AddReservedReportStatus1749000000000,
    RenameEncontradoLabel1749000100000,
    AddAdoptionStatusAndCompatibility1748600000000,
    AddAdoptionStatusCatalog1748600001000,
    AddAdoptionStatusFk1748600002000,
    AddFollowupCatalog1748600100000,
    AddSeguimientos1748600101000,
    AddMessageTable1748700000000,
    AddUserStatusAndNote1748710000000,
    AddPetCompatibilityFields1748800000000,
    AddChatSession1748900000000,
    AddAdoptionUpdatedAt1749100000000,
    AddAdoptionEvaluation1749200000000,
    AddFollowupStatusCompletado1749300000000,
    AddNotification1749400000000,
    AddMessagePhoto1749500000000,
    AddAdoptionKind1749600000000,
    AddViewsAndComments1749700000000,
  ],
  synchronize: false,
});
