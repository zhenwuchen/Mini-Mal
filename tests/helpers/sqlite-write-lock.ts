import { Worker } from "node:worker_threads";

export type SqliteWriteLock = {
  acquire: () => void;
  released: Promise<void>;
  close: () => Promise<void>;
};

export function createSqliteWriteLock(input: {
  databasePath: string;
  orderId: string;
  releaseAt: number;
}): SqliteWriteLock {
  const control = new SharedArrayBuffer(
    Int32Array.BYTES_PER_ELEMENT * 5,
  );
  const signal = new Int32Array(control);
  let worker: Worker | null = null;
  let releaseWorker: () => void = () => undefined;
  let rejectWorker: (error: Error) => void = () => undefined;
  const released = new Promise<void>((resolve, reject) => {
    releaseWorker = resolve;
    rejectWorker = reject;
  });

  return {
    acquire() {
      if (worker) {
        throw new Error("SQLite write lock was already acquired");
      }

      worker = new Worker(
        `
          const { DatabaseSync } = require("node:sqlite");
          const { parentPort, workerData } = require("node:worker_threads");
          const signal = new Int32Array(workerData.control);
          const database = new DatabaseSync(workerData.databasePath);

          try {
            database.exec("PRAGMA busy_timeout = 10000");
            database.exec("BEGIN IMMEDIATE");
            database
              .prepare(
                'UPDATE "Order" SET "shippingName" = "shippingName" WHERE "id" = ?',
              )
              .run(workerData.orderId);
            Atomics.store(signal, 1, 1);
            Atomics.notify(signal, 1);

            const remaining = Math.max(
              0,
              workerData.releaseAt - Date.now(),
            );
            Atomics.wait(signal, 2, 0, remaining);
            database.exec("COMMIT");
            Atomics.store(signal, 3, 1);
            Atomics.notify(signal, 3);
            parentPort.postMessage({ type: "released" });
          } catch (error) {
            Atomics.store(signal, 0, Number(error?.errcode ?? -1));
            Atomics.store(signal, 4, 1);
            Atomics.notify(signal, 1);
            Atomics.notify(signal, 3);
            parentPort.postMessage({
              type: "error",
              message:
                error instanceof Error ? error.message : String(error),
            });
          } finally {
            database.close();
          }
        `,
        {
          eval: true,
          env: {
            ...process.env,
            NODE_NO_WARNINGS: "1",
          },
          workerData: {
            control,
            databasePath: input.databasePath,
            orderId: input.orderId,
            releaseAt: input.releaseAt,
          },
        },
      );
      worker.on("message", (message: unknown) => {
        if (!message || typeof message !== "object") {
          return;
        }

        if ("type" in message && message.type === "released") {
          releaseWorker();
        }

        if (
          "type" in message &&
          message.type === "error" &&
          "message" in message
        ) {
          rejectWorker(new Error(String(message.message)));
        }
      });
      worker.once("error", rejectWorker);

      if (Atomics.wait(signal, 1, 0, 5000) === "timed-out") {
        throw new Error("Timed out acquiring the SQLite write lock");
      }

      if (Atomics.load(signal, 4) === 1) {
        throw new Error(
          `SQLite write lock worker failed (code ${Atomics.load(signal, 0)})`,
        );
      }
    },
    released,
    async close() {
      await worker?.terminate();
    },
  };
}
