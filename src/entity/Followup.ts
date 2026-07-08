import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("seguimientos")
export class Followup {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "pet_id", type: "uuid" })
  petId!: string;

  /** Responsable del seguimiento: admin/staff que lo lleva adelante. */
  @Index()
  @Column({ name: "user_id", type: "int" })
  userId!: number;

  /** Adoptante / persona interesada asociada (solo seguimientos post-adopción). */
  @Index()
  @Column({ name: "adopter_user_id", type: "int", nullable: true })
  adopterUserId!: number | null;

  @Index()
  @Column({ name: "refugio_id", type: "int", nullable: true })
  refugioId!: number | null;

  @Column({ name: "type_id", type: "int" })
  typeId!: number;

  @Column({ name: "status_id", type: "int", default: 1311 })
  statusId!: number;

  @Column({ name: "appointment_at", type: "timestamp" })
  appointmentAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
