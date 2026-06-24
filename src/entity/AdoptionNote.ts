import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Impresión / nota libre del admin sobre la evaluación de una solicitud. */
@Entity("adoption_note")
export class AdoptionNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: "adoption_id", type: "int" })
  adoptionId: number;

  @Column({ type: "text" })
  text: string;

  @Column({ name: "author_id", type: "int", nullable: true })
  authorId: number | null;

  @Column({ name: "author_name", type: "varchar", length: 120, nullable: true })
  authorName: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
