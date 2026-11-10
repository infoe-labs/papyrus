import type { DBCore } from 'dexie';
import { domainTables, type DatabaseMetadata } from './types';
export function revisionMiddleware(down: DBCore, enabled: () => boolean): DBCore {
  const queues = new WeakMap<object, Promise<unknown>>();
  return {
    ...down,
    transaction(stores, mode, options) {
      const tracked =
        enabled() &&
        mode === 'readwrite' &&
        stores.some((t) => (domainTables as readonly string[]).includes(t));
      return down.transaction(
        tracked ? [...new Set([...stores, 'metadata', 'backupState', 'changeJournal'])] : stores,
        mode,
        options,
      );
    },
    table(name) {
      const table = down.table(name);
      if (!(domainTables as readonly string[]).includes(name)) return table;
      return {
        ...table,
        mutate(req) {
          if (!enabled()) return table.mutate(req);
          const task = (queues.get(req.trans) ?? Promise.resolve()).then(async () => {
            const metadata = down.table('metadata');
            const current: DatabaseMetadata = (await metadata.get({
              trans: req.trans,
              key: 'database',
            })) ?? { key: 'database', id: crypto.randomUUID(), revision: 0, journalEnabled: true };
            if (current.frozenForRestore)
              throw Error(
                'Data changed or a restore is switching datasets. Reopen Papyrus before saving.',
              );
            const result = await table.mutate(req);
            if (result.numFailures)
              throw Error('Database write failed; the transaction has been rolled back.');
            const revision = current.revision + 1;
            await metadata.mutate({
              type: 'put',
              trans: req.trans,
              values: [{ ...current, revision }],
            });
            const stateTable = down.table('backupState');
            const state = await stateTable.get({ trans: req.trans, key: 'backup' });
            if (state)
              await stateTable.mutate({
                type: 'put',
                trans: req.trans,
                values: [
                  {
                    ...state,
                    currentDatabaseRevision: revision,
                    pendingChangesSinceBackup: Math.max(
                      0,
                      revision - (state.lastVerifiedBackupRevision ?? 0),
                    ),
                    backupStatus:
                      state.backupStatus === 'writing'
                        ? 'writing'
                        : state.backupMode === 'external-auto'
                          ? 'pending'
                          : state.backupStatus === 'not-configured'
                            ? 'not-configured'
                            : 'pending',
                  },
                ],
              });
            if (current.journalEnabled !== false) {
              const ids =
                'values' in req
                  ? req.values.map((v) =>
                      String(table.schema.primaryKey.extractKey?.(v) ?? 'unknown'),
                    )
                  : 'keys' in req
                    ? req.keys.map(String)
                    : ['*'];
              await down.table('changeJournal').mutate({
                type: 'put',
                trans: req.trans,
                values: [
                  { sequence: revision, at: Date.now(), table: name, operation: req.type, ids },
                ],
              });
            }
            return result;
          });
          queues.set(req.trans, task);
          return task;
        },
      };
    },
  };
}
