import { getApiClient } from "@/api/client";
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
  BrowseRowsResult,
  SchemaTree,
  TableStructure,
} from "../types";

export const databaseApi = {
  async list(): Promise<DatabaseConnection[]> {
    const client = await getApiClient();
    const res = await client.api.databases.$get();
    return unwrap<DatabaseConnection[]>(res);
  },

  async getById(id: string): Promise<DatabaseConnection> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].$get({ param: { id } });
    return unwrap<DatabaseConnection>(res);
  },

  async create(input: CreateDatabaseInput): Promise<DatabaseConnection> {
    const client = await getApiClient();
    const res = await client.api.databases.$post({ json: input });
    return unwrap<DatabaseConnection>(res);
  },

  async update(id: string, input: UpdateDatabaseInput): Promise<DatabaseConnection> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].$patch({
      param: { id },
      json: input,
    });
    return unwrap<DatabaseConnection>(res);
  },

  async delete(id: string): Promise<void> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].$delete({ param: { id } });
    await unwrap<void>(res);
  },

  async toggleStatus(id: string, nextStatus: "enabled" | "disabled"): Promise<DatabaseConnection> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].status.$patch({
      param: { id },
      json: { status: nextStatus },
    });
    return unwrap<DatabaseConnection>(res);
  },

  async testConnection(id: string): Promise<TestResult> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].test.$post({ param: { id } });
    return unwrap<TestResult>(res);
  },

  async getSchema(id: string): Promise<SchemaResponse> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].schema.$get({ param: { id }, query: {} });
    return unwrap<SchemaResponse>(res);
  },

  async getSchemaTree(id: string, filter?: string): Promise<SchemaTree> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].schema.$get({
      param: { id },
      query: filter ? { filter } : {},
    });
    return unwrap<SchemaTree>(res);
  },

  async getTableStructure(id: string, table: string, schema?: string): Promise<TableStructure> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].tables[":tableName"].schema.$get({
      param: { id, tableName: table },
      query: schema ? { schema } : {},
    });
    return unwrap<TableStructure>(res);
  },

  async browseRows(
    id: string,
    table: string,
    options: {
      schema?: string;
      limit: number;
      offset: number;
      orderBy?: string;
      direction?: "asc" | "desc";
      signal?: AbortSignal;
    },
  ): Promise<BrowseRowsResult> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].tables[":tableName"].rows.$get(
      {
        param: { id, tableName: table },
        query: {
          ...(options.schema ? { schema: options.schema } : {}),
          limit: String(options.limit),
          offset: String(options.offset),
          ...(options.orderBy
            ? { orderBy: options.orderBy, direction: options.direction ?? "asc" }
            : {}),
        },
      },
      options.signal ? { init: { signal: options.signal } } : undefined,
    );
    return unwrap<BrowseRowsResult>(res);
  },

  async testDraft(
    input: CreateDatabaseInput & { id?: string },
    signal?: AbortSignal,
  ): Promise<TestResult> {
    const client = await getApiClient();
    const res = await client.api.databases.test.$post(
      { json: input },
      signal ? { init: { signal } } : undefined,
    );
    return unwrap<TestResult>(res);
  },

  async duplicate(id: string, name?: string): Promise<DatabaseConnection> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].duplicate.$post({
      param: { id },
      json: name ? { name } : {},
    });
    return unwrap<DatabaseConnection>(res);
  },

  async getConnectionString(id: string): Promise<{ url: string }> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"]["connection-string"].$get({ param: { id } });
    return unwrap<{ url: string }>(res);
  },

  async getTableSchema(id: string, tableName: string): Promise<TableSchema> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].tables[":tableName"].schema.$get({
      param: { id, tableName },
      query: {},
    });
    return unwrap<TableSchema>(res);
  },

  async executeQuery(id: string, query: string, limit?: number): Promise<StructuredQueryResult> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].query.$post({
      param: { id },
      json: { query, limit },
    });
    return unwrap<StructuredQueryResult>(res);
  },

  async getLogs(id: string, limit?: number): Promise<QueryLogItem[]> {
    const client = await getApiClient();
    const res = await client.api.databases[":id"].logs.$get({
      param: { id },
      query: limit ? { limit: String(limit) } : {},
    });
    return unwrap<QueryLogItem[]>(res);
  },
};
