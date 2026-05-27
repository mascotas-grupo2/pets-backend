import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Index("UQ_catalog_value_catalog_code", ["catalog", "code"], { unique: true })
@Entity("catalog_value")
export class CatalogValue {
  @PrimaryColumn({ type: "int" })
  id!: number;

  @Column({ type: "varchar", length: 50 })
  catalog!: string;

  @Column({ type: "varchar", length: 80 })
  code!: string;

  @Column({ type: "varchar", length: 120 })
  label!: string;
}
