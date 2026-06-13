import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("comment")
export class Comment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  petId: string;

  @Column({ type: "int" })
  userId: number;

  @Column({ type: "varchar", length: 60, default: "general" })
  section: string;

  @Column({ type: "text" })
  content: string;

  @Column({ type: "boolean", default: false })
  approved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
