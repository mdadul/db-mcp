import { createExecutor, type DbConfig, type DbExecutor } from "./dbExecutor.ts";

export type { DbConfig, DbExecutor };

/** Executor pools keyed by database connection id. */
const pools = new Map<string, DbExecutor>();

export async function getExecutor(
  id: string,
  config: DbConfig
): Promise<DbExecutor> {
  const existing = pools.get(id);
  if (existing) return existing;

  const executor = await createExecutor(config);
  pools.set(id, executor);
  return executor;
}

/** Remove and gracefully end the cached pool for a database connection. */
export function removeConnection(id: string): void {
  const executor = pools.get(id);
  if (executor) {
    void executor.close();
    pools.delete(id);
  }
}
