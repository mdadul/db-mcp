import { client } from "@/api/client";
import { unwrap } from "@/api/unwrap";
import type {
  DatabaseConnection,
  TestResult,
  CreateDatabaseInput,
  UpdateDatabaseInput,
  StructuredQueryResult,
  QueryLogItem,
  SchemaResponse,
  TableSchema,
} from "../types";

export const databaseApi = {
  async list(): Promise<DatabaseConnection[]> {
    const res = await client.api.databases.$get();
    return unwrap<DatabaseConnection[]>(res);
  },

  async getById(id: string): Promise<DatabaseConnection> {
    const res = await client.api.databases[":id"].$get({ param: { id } });
    return unwrap<DatabaseConnection>(res);
  },

  async create(input: CreateDatabaseInput): Promise<DatabaseConnection> {
    const res = await client.api.databases.$post({ json: input });
    return unwrap<DatabaseConnection>(res);
  },

  async update(id: string, input: UpdateDatabaseInput): Promise<DatabaseConnection> {
    const res = await client.api.databases[":id"].$patch({
      param: { id },
      json: input,
    });
    return unwrap<DatabaseConnection>(res);
  },

  async delete(id: string): Promise<void> {
    const res = await client.api.databases[":id"].$delete({ param: { id } });
    await unwrap<void>(res);
  },

  async toggleStatus(id: string, nextStatus: "enabled" | "disabled"): Promise<DatabaseConnection> {
    const res = await client.api.databases[":id"].status.$patch({
      param: { id },
      json: { status: nextStatus },
    });
    return unwrap<DatabaseConnection>(res);
  },

  async testConnection(id: string): Promise<TestResult> {
    const res = await client.api.databases[":id"].test.$post({ param: { id } });
    return unwrap<TestResult>(res);
  },

  async getSchema(id: string): Promise<SchemaResponse> {
    const res = await client.api.databases[":id"].schema.$get({ param: { id } });
    return unwrap<SchemaResponse>(res);
  },

  async getTableSchema(id: string, tableName: string): Promise<TableSchema> {
    const res = await client.api.databases[":id"].tables[":tableName"].schema.$get({
      param: { id, tableName },
    });
    return unwrap<TableSchema>(res);
  },

  async executeQuery(id: string, query: string, limit?: number): Promise<StructuredQueryResult> {
    const res = await client.api.databases[":id"].query.$post({
      param: { id },
      json: { query, limit },
    });
    return unwrap<StructuredQueryResult>(res);
  },

  async getLogs(id: string, limit?: number): Promise<QueryLogItem[]> {
    const res = await client.api.databases[":id"].logs.$get({
      param: { id },
      query: limit ? { limit: String(limit) } : {},
    });
    return unwrap<QueryLogItem[]>(res);
  },
};

