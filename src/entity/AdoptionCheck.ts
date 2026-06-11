import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

/** Un ítem del checklist de evaluación marcado para una solicitud. */
@Entity("adoption_check")
@Unique(["adoptionId", "item"])
export class AdoptionCheck {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: "adoption_id", type: "int" })
  adoptionId: number;

  @Column({ type: "varchar", length: 120 })
  item: string;

  @Column({ name: "checked_by", type: "int", nullable: true })
  checkedBy: number | null;

  @CreateDateColumn({ name: "checked_at" })
  checkedAt: Date;
}
