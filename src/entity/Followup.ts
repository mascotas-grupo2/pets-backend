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

  @Index()
  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Column({ name: "type_id", type: "int" })
  typeId!: number;

  @Column({ name: "status_id", type: "int", default: 1311 })
  statusId!: number;

  @Column({ name: "appointment_at", type: "timestamp" })
  appointmentAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
