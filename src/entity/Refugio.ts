import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("refugio")
export class Refugio {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @Column({ type: "varchar", length: 80, unique: true })
  slug!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  location!: string | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
