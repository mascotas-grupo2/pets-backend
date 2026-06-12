import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User.js";

/** Notificación in-app para un usuario (mensajes, cambios de estado, moderación). */
@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "int" })
  userId!: number;

  /** "message" | "adoption_status" | "publication" */
  @Column({ type: "varchar", length: 40 })
  type!: string;

  @Column({ type: "varchar", length: 160 })
  title!: string;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  /** Ruta del front a la que lleva la notificación al hacer click. */
  @Column({ type: "varchar", length: 200, nullable: true })
  link!: string | null;

  @Column({ type: "boolean", default: false })
  read!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user!: User;
}
