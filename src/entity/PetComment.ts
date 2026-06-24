import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

/**
 * Comentario público en una publicación de mascota. Lo puede dejar cualquiera
 * (anónimo o logueado); queda "pending" hasta que el dueño lo aprueba/rechaza.
 */
@Entity()
export class PetComment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "pet_id", type: "uuid" })
  petId!: string;

  @Column({ name: "author_user_id", type: "int", nullable: true })
  authorUserId!: number | null;

  @Column({ name: "author_name", type: "varchar", length: 120 })
  authorName!: string;

  @Column({ name: "author_email", type: "varchar", length: 200, nullable: true })
  authorEmail!: string | null;

  @Column({ type: "text" })
  text!: string;

  // "pending" | "approved" | "rejected"
  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
