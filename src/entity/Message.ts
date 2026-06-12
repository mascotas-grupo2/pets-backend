import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User.js";

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int" })
  senderId!: number;

  @Column({ type: "int" })
  receiverId!: number;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "text", nullable: true })
  photo!: string | null;

  @Column({ type: "boolean", default: false })
  read!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "senderId" })
  sender!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "receiverId" })
  receiver!: User;
}
