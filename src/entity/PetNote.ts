import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum PetNoteKind {
  GENERAL = "general",
  MEDICA = "medica",
  ADOPCION = "adopcion",
}

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

  @Column({ type: "enum", enum: PetNoteKind, default: PetNoteKind.GENERAL })
  kind: PetNoteKind;

  @CreateDateColumn()
  createdAt: Date;
}
