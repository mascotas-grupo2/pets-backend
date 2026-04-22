import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 200, unique: true })
  email!: string;

  @Column({ name: "password_hash", type: "varchar" })
  passwordHash!: string;

  @Column({ name: "password_salt", type: "varchar" })
  passwordSalt!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
