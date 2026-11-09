import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Module } from "@nestjs/common";
import { createApplication } from "../application";
import { HealthController } from "./health.controller";
import { DatabaseService } from "../database.service";

test("HTTP: liveness independente do banco, readiness 503/200 e nenhum segredo", async () => {
  let available = false;
  @Module({
    controllers: [HealthController],
    providers: [
      {
        provide: DatabaseService,
        useValue: { isAvailable: async () => available },
      },
    ],
  })
  class TestModule {}
  const app = await createApplication(TestModule, false);
  try {
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();
    const live = await fetch(`${url}/api/v1/health/live`);
    assert.equal(live.status, 200);
    assert.equal(live.headers.get("cache-control"), "no-store");
    assert.equal(live.headers.get("x-powered-by"), null);
    assert.deepEqual(await live.json(), {
      status: "ok",
      service: "invictus-api",
    });
    const down = await fetch(`${url}/api/v1/health/ready`);
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), {
      status: "not_ready",
      checks: { database: "down" },
    });
    available = true;
    const ready = await fetch(`${url}/api/v1/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: "ready",
      checks: { database: "up" },
    });
    assert.equal((await fetch(`${url}/api/v1/tenants`)).status, 404);
  } finally {
    await app.close();
  }
});

test("driver real: banco indisponível retorna false sem vazar erro", async () => {
  const database = new DatabaseService(
    "postgresql://test:private-test-secret@127.0.0.1:1/invictus_test",
  );
  try {
    assert.equal(await database.isAvailable(), false);
  } finally {
    await database.onApplicationShutdown();
  }
});
