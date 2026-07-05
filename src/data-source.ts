import "reflect-metadata";
import { DataSource } from "typeorm";
import { Refugio } from "./entity/Refugio.js";
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
import { Activity } from "./entity/Activity.js";
import { Sighting } from "./entity/Sighting.js";
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
import { AddMessagePhoto1749500000000 } from "./migration/1749500000000-AddMessagePhoto.js";
import { AddAdoptionKind1749600000000 } from "./migration/1749600000000-AddAdoptionKind.js";
import { AddViewsAndComments1749700000000 } from "./migration/1749700000000-AddViewsAndComments.js";
import { AddActivity1749800000000 } from "./migration/1749800000000-AddActivity.js";
import { AddSighting1749900000000 } from "./migration/1749900000000-AddSighting.js";
import { AddIsOwnerToPet1750000000000 } from "./migration/1750000000000-AddIsOwnerToPet.js";
import { AddOwnerUserIdToPet1750000000001 } from "./migration/1750000000001-AddOwnerUserIdToPet.js";
import { AddPetExpiresAt1750000002000 } from "./migration/1750000002000-AddPetExpiresAt.js";
import { AddPetExpiryNotifiedAt1750000003000 } from "./migration/1750000003000-AddPetExpiryNotifiedAt.js";
import { AddPetExpiryWarnedAt1750000004000 } from "./migration/1750000004000-AddPetExpiryWarnedAt.js";
import { AddRefugio1750100000000 } from "./migration/1750100000000-AddRefugio.js";
import { AddRowLevelSecurity1750200000000 } from "./migration/1750200000000-AddRowLevelSecurity.js";
import { FixSuperadminRls1750300000000 } from "./migration/1750300000000-FixSuperadminRls.js";
import { AddSightingAccepted1750400000000 } from "./migration/1750400000000-AddSightingAccepted.js";
import { AddSightingRejectedAndCoords1750500000000 } from "./migration/1750500000000-AddSightingRejectedAndCoords.js";
import { AddAdopterToFollowup1750600000000 } from "./migration/1750600000000-AddAdopterToFollowup.js";
import { RemoveEncontradoStatus1750700000000 } from "./migration/1750700000000-RemoveEncontradoStatus.js";
import { AddRefugioCoordinates1750800000000 } from "./migration/1750800000000-AddRefugioCoordinates.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [
    Refugio,
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
    Activity,
    Sighting,
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
    AddActivity1749800000000,
    AddSighting1749900000000,
    AddIsOwnerToPet1750000000000,
    AddOwnerUserIdToPet1750000000001,
    AddPetExpiresAt1750000002000,
    AddPetExpiryNotifiedAt1750000003000,
    AddPetExpiryWarnedAt1750000004000,
    AddRefugio1750100000000,
    AddRowLevelSecurity1750200000000,
    FixSuperadminRls1750300000000,
    AddSightingAccepted1750400000000,
    AddSightingRejectedAndCoords1750500000000,
    AddAdopterToFollowup1750600000000,
    RemoveEncontradoStatus1750700000000,
    AddRefugioCoordinates1750800000000,
  ],
  synchronize: false,
});
