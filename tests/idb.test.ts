import { describe, expect, it } from "vitest";

describe("indexeddb test harness", () => {
  it("exposes fake-indexeddb globals", () => {
    expect(typeof indexedDB).toBe("object");
    expect(typeof IDBKeyRange).toBe("function");
  });

  it("can open a database", async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("harness-check", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(db.name).toBe("harness-check");
    db.close();
  });
});
