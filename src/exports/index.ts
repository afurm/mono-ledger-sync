export type ExportFormat = "csv" | "json" | "sqlite";

export interface ExportRequest {
  profile: string;
  format: ExportFormat;
  from?: number;
  to?: number;
  accountIds?: readonly string[];
  categoryIds?: readonly string[];
}
