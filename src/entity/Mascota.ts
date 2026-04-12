import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum Especie {
  PERRO = "PERRO",
  GATO = "GATO",
  OTRO = "OTRO",
}

export enum Estado {
  AVISTADO = "AVISTADO",
  TRANSITO = "TRANSITO",
  REFUGIO = "REFUGIO",
}

@Entity("mascota")
export class Mascota {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true, type: "varchar" })
  nombre: string | null;

  @Column({ type: "enum", enum: Especie })
  especie: Especie;

  @Column({ type: "enum", enum: Estado })
  estado: Estado;

  @Column({ nullable: true, type: "varchar" })
  raza: string | null;

  @Column({ nullable: true, type: "int" })
  edad: number | null;

  @Column({ nullable: true, type: "text" })
  descripcion: string | null;

  @Column({ nullable: true, type: "varchar" })
  direccion: string | null;

  @Column({ nullable: true, type: "float" })
  latitud: number | null;

  @Column({ nullable: true, type: "float" })
  longitud: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
