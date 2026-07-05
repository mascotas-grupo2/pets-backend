import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Avistamiento ("La vi") reportado sobre una mascota perdida. Lo deja cualquiera
 * (anónimo o logueado). Queda registrado y notifica al dueño.
 */
@Entity()
@Index(["petId"])
export class Sighting {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "pet_id", type: "uuid" })
  petId!: string;

  @Column({ name: "reporter_user_id", type: "int", nullable: true })
  reporterUserId!: number | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  place!: string | null;

  /** Punto exacto marcado en el mapa (opcional). */
  @Column({ type: "double precision", nullable: true })
  latitud!: number | null;

  @Column({ type: "double precision", nullable: true })
  longitud!: number | null;

  /** Fecha del avistamiento como la cargó el usuario (YYYY-MM-DD). */
  @Column({ name: "sighted_on", type: "varchar", length: 40, nullable: true })
  sightedOn!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  contact!: string | null;

  /** El dueño/refugio confirmó el avistamiento ("lo vi" aceptado). */
  @Column({ type: "boolean", default: false })
  accepted!: boolean;

  @Column({ name: "accepted_at", type: "timestamp", nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: "accepted_by_user_id", type: "int", nullable: true })
  acceptedByUserId!: number | null;

  /** El dueño/refugio descartó el avistamiento (no corresponde / no era la mascota). */
  @Column({ type: "boolean", default: false })
  rejected!: boolean;

  @Column({ name: "rejected_at", type: "timestamp", nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: "rejected_by_user_id", type: "int", nullable: true })
  rejectedByUserId!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
