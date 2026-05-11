export const sqliteStorageEngine = "sqlite";

export interface SqliteLedgerDbOptions {
  filePath: string;
  profile: string;
  readonly?: boolean;
}

export interface SqliteMigration {
  id: string;
  description: string;
  sql: string;
}
