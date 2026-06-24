import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

/**
 * Registro de actividad del sistema (para métricas y dashboard). Cada fila es un
 * evento: usuario nuevo, adoptante nuevo, solicitud, seguimiento, publicación,
 * mensaje o comentario. `createdAt` refleja el momento real del evento.
 */
export type ActivityType =
  | "usuario_nuevo"
  | "adoptante_nuevo"
  | "solicitud"
  | "seguimiento"
  | "publicacion"
  | "mensaje"
  | "comentario";

@Entity()
@Index(["type"])
@Index(["createdAt"])
export class Activity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 40 })
  type!: ActivityType;

  /** Usuario que generó la actividad (si aplica). */
  @Column({ name: "actor_user_id", type: "int", nullable: true })
  actorUserId!: number | null;

  @Column({ name: "refugio_id", type: "int", nullable: true })
  refugioId!: number | null;

  /** Entidad relacionada (pet | adoption | followup | user | message | comment). */
  @Column({ name: "ref_type", type: "varchar", length: 40, nullable: true })
  refType!: string | null;

  /** Id del registro relacionado (uuid o numérico, como string). */
  @Column({ name: "ref_id", type: "varchar", length: 80, nullable: true })
  refId!: string | null;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  link!: string | null;

  // No es @CreateDateColumn para poder setear la fecha real del evento en el backfill.
  @Column({ type: "timestamp", default: () => "now()" })
  createdAt!: Date;
}
