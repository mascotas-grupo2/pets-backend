import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CatalogIds } from "../lib/catalog-constants.js";

@Entity("pet_note")
export class PetNote {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  petId: string;

  @Column({ type: "int", nullable: true })
  authorId: number | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  authorName: string | null;

  @Column({ type: "text" })
  text: string;

  @Column({ type: "int", default: CatalogIds.petNoteKind.general })
  kindId: number;

  @CreateDateColumn()
  createdAt: Date;
}
