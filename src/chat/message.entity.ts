import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("message")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  conversationId: string;

  /** Autor registrado; nulo si lo envió una contraparte invitada. */
  @Column({ type: "int", nullable: true })
  senderUserId: number | null;

  @Column({ type: "varchar", length: 120 })
  senderName: string;

  @Column({ type: "text" })
  text: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
