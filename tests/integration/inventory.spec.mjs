import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authDatabase } from "../support/auth-database.mjs";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  encrypt,
  newMfaSecret,
  totp,
} from "../../apps/api/dist/modules/identity/crypto.js";
test(
  "Produtos e estoque reais: cálculo, acesso, concorrência e auditoria",
  { timeout: 120000 },
  async (t) => {
    const f = await authDatabase();
    let app, url, owner, normal, unitA, unitB, product, version, memberRole;
    const req = async (path, s, b) => {
      const r = await fetch(url + path, {
        method: b === undefined ? "GET" : "POST",
        headers: {
          ...(b === undefined
            ? {}
            : { "Content-Type": "application/json", Origin: f.config.origin }),
          ...(s ? { Cookie: s.cookie, "X-CSRF-Token": s.data.csrf } : {}),
        },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    };
    const post = (p, b, s = owner) => req(p, s, b);
    const get = (p, s = owner) => req(p, s);
    const productBody = {
      code: "ARROZ-5KG",
      name: "Arroz Tipo 1 - 5 kg",
      description: "Teste de cadastro",
      category: "Mercearia",
      brand: "Marca teste",
      baseUnit: "UN",
      packageName: "Fardo",
      packageFactor: "10",
      barcodes: ["4006381333931"],
      salePrice: "5.00",
      desiredMargin: "40",
      minimumMargin: "20",
      minimumStock: "20",
      idealStock: "100",
      active: true,
    };
    const move = (kind, quantity, cost = "0", extra = {}) =>
      post("inventory/movements", {
        unitId: unitA,
        productId: product,
        kind,
        quantity,
        packaged: false,
        cost,
        reason: "Movimento de teste",
        requestKey: randomUUID(),
        ...extra,
      });
    const detail = async () => {
      const r = await get("inventory/products/" + product + "?unitId=" + unitA);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data;
    };
    try {
      app = await createApplication(
        AppModule.register(f.appUrl, f.config),
        f.config.origin,
      );
      await app.listen(0, "127.0.0.1");
      url = (await app.getUrl()) + "/api/v1/";
      const secret = newMfaSecret();
      await f.admin.query(
        "UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2",
        [encrypt(secret, f.key), f.users.owner.id],
      );
      owner = await post(
        "auth/login",
        { email: f.users.owner.email, password: f.users.owner.password },
        null,
      );
      owner = await post(
        "auth/mfa/verify",
        { code: totp(secret, f.users.owner.email).generate() },
        owner,
      );
      assert.equal(owner.status, 200, JSON.stringify(owner.data));
      normal = await post(
        "auth/login",
        { email: f.users.normal.email, password: f.users.normal.password },
        null,
      );
      const company = await post("organizations/companies/save", {
        legalName: "Comércio teste",
        tradeName: "Supermercado Teste",
        cnpj: "12ABC34501DE35",
        matrixCode: "MAT",
        active: true,
      });
      assert.equal(company.status, 200, JSON.stringify(company.data));
      unitA = company.data.matrixId;
      const branch = await post("organizations/units/save", {
        companyId: company.data.id,
        parentId: unitA,
        kind: "filial",
        code: "LOJA-B",
        name: "Loja Norte",
        cnpj: null,
        active: true,
      });
      unitB = branch.data.id;
      await t.test(
        "produto central persistido com código e GTIN únicos; validações e versão",
        async () => {
          assert.equal((await req("inventory/products", null)).status, 401);
          for (const headers of [
            { Origin: f.config.origin },
            {
              Origin: "https://externo.example.invalid",
              "X-CSRF-Token": owner.data.csrf,
            },
            {
              Origin: f.config.origin,
              "X-CSRF-Token": owner.data.csrf,
              "Sec-Fetch-Site": "cross-site",
            },
          ]) {
            const r = await fetch(url + "inventory/products/save", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: owner.cookie,
                ...headers,
              },
              body: JSON.stringify(productBody),
            });
            assert.equal(r.status, 403);
          }
          const r = await post("inventory/products/save", productBody);
          assert.equal(r.status, 200, JSON.stringify(r.data));
          product = r.data.id;
          version = r.data.version;
          assert.equal(
            (await post("inventory/products/save", productBody)).status,
            409,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                code: "OUTRO",
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                code: "OUTRO",
                barcodes: ["04006381333931"],
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                code: "OUTRO",
                barcodes: ["4006381333932"],
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                code: "OUTRO",
                salePrice: "NaN",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                id: product,
                version: 99,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                id: product,
                version,
                baseUnit: "KG",
              })
            ).status,
            409,
          );
          const d = await detail();
          assert.equal(d.product.name, productBody.name);
          assert.equal(Number(d.product.stock.physical), 0);
        },
      );
      await t.test(
        "100 a 3 + 100 a 4 = 200 unidades, 700 de valor e custo médio 3,50",
        async () => {
          assert.equal((await move("entry", "100", "3")).status, 200);
          assert.equal((await move("entry", "100", "4")).status, 200);
          const d = await detail();
          assert.equal(Number(d.product.stock.physical), 200);
          assert.equal(Number(d.product.stock.value), 700);
          assert.equal(Number(d.product.stock.averageCost), 3.5);
          assert.equal(d.movements.length, 2);
          assert.equal(Number(d.movements[1].cost), 3);
          assert.equal(
            ((5 - Number(d.product.stock.averageCost)) / 5) * 100,
            30,
          );
        },
      );
      await t.test(
        "saída pelo custo médio preserva o histórico e não altera preço",
        async () => {
          const r = await move("out", "10");
          assert.equal(r.status, 200);
          const d = await detail();
          assert.equal(Number(d.product.stock.physical), 190);
          assert.equal(Number(d.product.stock.value), 665);
          assert.equal(Number(d.product.salePrice), 5);
        },
      );
      await t.test(
        "reserva reduz disponível, impede saída excessiva e libera sem mudar físico",
        async () => {
          assert.equal((await move("reserve", "180")).status, 200);
          assert.equal((await move("out", "11")).status, 409);
          let d = await detail();
          assert.equal(Number(d.product.stock.available), 10);
          assert.equal(Number(d.product.stock.physical), 190);
          assert.equal((await move("release", "181")).status, 409);
          assert.equal((await move("release", "180")).status, 200);
        },
      );
      await t.test(
        "fardo convertido e custo da embalagem aplicado uma única vez",
        async () => {
          const r = await move("entry", "1", "40", { packaged: true });
          assert.equal(r.status, 200);
          const d = await detail();
          assert.equal(Number(d.product.stock.physical), 200);
          assert.equal(Number(d.product.stock.value), 705);
          assert.equal(Number(d.movements[0].factor), 10);
          assert.equal(Number(d.movements[0].baseQuantity), 10);
          assert.equal(Number(d.product.stock.lastCost), 4);
        },
      );
      await t.test(
        "duplicata é idempotente, payload diferente é conflito; concorrência não perde saldo",
        async () => {
          const body = {
            unitId: unitA,
            productId: product,
            kind: "entry",
            quantity: "1",
            packaged: false,
            cost: "2",
            reason: "Confirmação repetida",
            requestKey: randomUUID(),
          };
          const a = await post("inventory/movements", body),
            b = await post("inventory/movements", body);
          assert.equal(a.status, 200);
          assert.equal(b.status, 200);
          assert.equal(a.data.id, b.data.id);
          assert.equal(b.data.replayed, true);
          assert.equal(
            (await post("inventory/movements", { ...body, quantity: "2" }))
              .status,
            409,
          );
          const results = await Promise.all(
            Array.from({ length: 5 }, () => move("entry", "1", "2")),
          );
          assert.ok(results.every((r) => r.status === 200));
          assert.equal(Number((await detail()).product.stock.physical), 206);
        },
      );
      await t.test(
        "estorno é registro novo, restaura saldo e recusa estorno antigo ou repetido",
        async () => {
          const before = await detail();
          const r = await move("loss", "2");
          assert.equal(r.status, 200);
          assert.equal(
            (
              await move("reverse", "1", "0", {
                reversalOf: before.movements[0].id,
              })
            ).status,
            409,
          );
          assert.equal(
            (await move("reverse", "1", "0", { reversalOf: r.data.id })).status,
            200,
          );
          const after = await detail();
          assert.equal(Number(after.product.stock.physical), 206);
          assert.equal(after.movements[0].kind, "reverse");
          assert.equal(
            (await move("reverse", "1", "0", { reversalOf: r.data.id })).status,
            409,
          );
        },
      );
      await t.test(
        "limites por filial e alerta inclusive na igualdade; saldo da outra unidade é independente",
        async () => {
          const r = await post("inventory/settings", {
            unitId: unitA,
            productId: product,
            minimumStock: "206",
            idealStock: "300",
          });
          assert.equal(r.status, 200);
          let list = await get(
            "inventory/products?unitId=" + unitA + "&status=low",
          );
          assert.equal(list.data.total, 1);
          assert.equal(list.data.summary.low, 1);
          assert.equal((await move("entry", "1", "3")).status, 200);
          list = await get(
            "inventory/products?unitId=" + unitA + "&status=low",
          );
          assert.equal(list.data.total, 0);
          const d = await get(
            "inventory/products/" + product + "?unitId=" + unitB,
          );
          assert.equal(Number(d.data.product.stock.physical), 0);
          assert.equal(Number(d.data.product.stock.minimumStock), 20);
        },
      );
      await t.test(
        "permissões, RLS por filial e bloqueio entre redes/usuário sem acesso",
        async () => {
          assert.equal((await get("inventory/products", normal)).status, 403);
          assert.equal(
            (
              await post(
                "inventory/movements",
                {
                  unitId: unitA,
                  productId: product,
                  kind: "out",
                  quantity: "1",
                  cost: "0",
                  packaged: false,
                  reason: "Teste sem acesso",
                  requestKey: randomUUID(),
                },
                normal,
              )
            ).status,
            403,
          );
          const role = await post("access/roles/save", {
            name: "Consulta estoque filial",
            permissions: ["products.read", "stock.read"],
          });
          assert.equal(role.status, 200, JSON.stringify(role.data));
          memberRole = (
            await f.admin.query(
              "SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2",
              [f.tenantA, "Consulta estoque filial"],
            )
          ).rows[0].id;
          await f.admin.query(
            "UPDATE identity.memberships SET role_id=$1,all_units=false WHERE user_id=$2 AND tenant_id=$3",
            [memberRole, f.users.normal.id, f.tenantA],
          );
          await f.admin.query(
            "INSERT INTO organizations.membership_units SELECT tenant_id,id,$1 FROM identity.memberships WHERE user_id=$2 AND tenant_id=$3",
            [unitB, f.users.normal.id, f.tenantA],
          );
          assert.equal(
            (await get("inventory/products?unitId=" + unitB, normal)).status,
            200,
          );
          assert.equal(
            (await get("inventory/products?unitId=" + unitA, normal)).status,
            404,
          );
          assert.equal(
            (
              await get(
                "inventory/products/" + product + "?unitId=" + unitA,
                normal,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await post(
                "inventory/products/save",
                { ...productBody, id: product, version },
                normal,
              )
            ).status,
            403,
          );
          const other = await post(
            "auth/login",
            { email: f.users.other.email, password: f.users.other.password },
            null,
          );
          assert.equal(
            (await get("inventory/products/" + product, other)).status,
            403,
          );
          const db = new pg.Client({ connectionString: f.authUrl });
          await db.connect();
          try {
            await db.query("BEGIN");
            await db.query(
              "SELECT set_config('app.auth_tenant_id',$1,true),set_config('app.auth_user_id',$2,true)",
              [f.tenantA, f.users.normal.id],
            );
            assert.equal(
              (await db.query("SELECT * FROM inventory.levels")).rowCount,
              0,
            );
            await db.query("ROLLBACK");
          } finally {
            await db.end();
          }
        },
      );
      await t.test(
        "falha da auditoria reverte saldo, movimento e cadastro sem efeito parcial",
        async () => {
          const before = await detail();
          const count = Number(
            (
              await f.admin.query(
                "SELECT count(*) FROM inventory.movements WHERE tenant_id=$1",
                [f.tenantA],
              )
            ).rows[0].count,
          );
          await f.admin.query(
            "CREATE FUNCTION audit.reject_inventory_test() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END $function$",
          );
          await f.admin.query(
            "CREATE TRIGGER reject_inventory_test BEFORE INSERT ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.reject_inventory_test()",
          );
          try {
            assert.equal((await move("entry", "1", "3")).status, 503);
            const { stock, ...input } = before.product;
            assert.equal(
              (
                await post("inventory/products/save", {
                  ...input,
                  name: "Alteração rejeitada",
                })
              ).status,
              503,
            );
          } finally {
            await f.admin.query(
              "DROP TRIGGER reject_inventory_test ON audit.events",
            );
          }
          const after = await detail();
          assert.deepEqual(after.product.stock, before.product.stock);
          assert.equal(after.product.name, before.product.name);
          assert.equal(
            Number(
              (
                await f.admin.query(
                  "SELECT count(*) FROM inventory.movements WHERE tenant_id=$1",
                  [f.tenantA],
                )
              ).rows[0].count,
            ),
            count,
          );
        },
      );
      await t.test(
        "permissão de movimentação exige MFA, permite somente a filial e é revogada imediatamente",
        async () => {
          assert.equal(
            (
              await post("access/roles/save", {
                name: "Inválido",
                permissions: ["stock.manage"],
              })
            ).status,
            400,
          );
          await post("access/roles/save", {
            name: "Estoquista filial",
            permissions: [
              "organizations.read",
              "products.read",
              "stock.read",
              "stock.manage",
            ],
          });
          const role = (
            await f.admin.query(
              "SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2",
              [f.tenantA, "Estoquista filial"],
            )
          ).rows[0].id;
          const member = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
              [f.tenantA, f.users.normal.id],
            )
          ).rows[0].id;
          assert.equal(
            (
              await post("access/members/change", {
                id: member,
                roleId: role,
                active: true,
                allUnits: false,
                unitIds: [unitB],
              })
            ).status,
            200,
          );
          assert.equal(
            (await get("inventory/products?unitId=" + unitB, normal)).status,
            403,
          );
          const setup = await post("auth/mfa/enroll", {}, normal);
          assert.equal(setup.status, 200);
          normal = await post(
            "auth/mfa/verify",
            { code: totp(setup.data.secret, f.users.normal.email).generate() },
            normal,
          );
          assert.equal(normal.status, 200);
          const body = {
            unitId: unitB,
            productId: product,
            kind: "entry",
            quantity: "2",
            cost: "3",
            packaged: false,
            reason: "Reposição autorizada",
            requestKey: randomUUID(),
          };
          assert.equal(
            (await post("inventory/movements", body, normal)).status,
            200,
          );
          assert.equal(
            (
              await post(
                "inventory/movements",
                { ...body, unitId: unitA, requestKey: randomUUID() },
                normal,
              )
            ).status,
            404,
          );
          await post("access/members/change", {
            id: member,
            roleId: memberRole,
            active: true,
            allUnits: false,
            unitIds: [unitB],
          });
          assert.equal(
            (
              await post(
                "inventory/movements",
                { ...body, requestKey: randomUUID() },
                normal,
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "produto inativo impede operações novas; alterações e movimentos estão na auditoria",
        async () => {
          let d = await detail();
          const { stock, ...input } = d.product;
          assert.equal(
            (await post("inventory/products/save", { ...input, active: false }))
              .status,
            200,
          );
          assert.equal((await move("entry", "1", "2")).status, 409);
          assert.equal(
            (await get("inventory/products?status=inactive")).data.total,
            1,
          );
          const audit = await get("audit/events?entityId=" + product);
          assert.equal(audit.status, 200);
          assert.ok(
            audit.data.items.some((e) => e.action === "product.changed"),
          );
          const changes = await f.admin.query(
            "SELECT category,actor_id FROM audit.events WHERE tenant_id=$1 AND category='inventory'",
            [f.tenantA],
          );
          assert.ok(changes.rowCount > 0);
          assert.ok(
            changes.rows.every((r) =>
              [f.users.owner.id, f.users.normal.id].includes(r.actor_id),
            ),
          );
        },
      );
      await t.test(
        "conta HTTP não altera saldos, apaga movimentos nem executa funções internas",
        async () => {
          const grants = await f.admin.query(
            "SELECT has_table_privilege('invictus_auth','inventory.levels','UPDATE') AS update,has_table_privilege('invictus_auth','inventory.movements','DELETE') AS delete,has_function_privilege('invictus_auth','inventory.confirm_movement()','EXECUTE') AS execute",
          );
          assert.deepEqual(grants.rows[0], {
            update: false,
            delete: false,
            execute: false,
          });
        },
      );
      await t.test(
        "filtros e payloads hostis são rejeitados sem alterar saldo",
        async () => {
          assert.equal((await get("inventory/products?page=-1")).status, 400);
          assert.equal(
            (await get("inventory/products?unitId=abc")).status,
            400,
          );
          assert.equal(
            (await get("inventory/products?status=other")).status,
            400,
          );
          assert.equal(
            (await get("inventory/products?tenantId=" + f.tenantB)).status,
            400,
          );
          assert.equal(
            (
              await post("inventory/products/save", {
                ...productBody,
                tenantId: f.tenantB,
              })
            ).status,
            400,
          );
          assert.equal((await move("entry", "-1", "3")).status, 400);
        },
      );
      await t.test(
        "saídas concorrentes não duplicam disponibilidade e saída final zera resíduo",
        async () => {
          const created = await post("inventory/products/save", {
            ...productBody,
            code: "DECIMAL",
            name: "Produto fracionado",
            baseUnit: "KG",
            barcodes: [],
            packageFactor: "1",
          });
          assert.equal(created.status, 200);
          const id = created.data.id;
          const send = (kind, quantity, cost = "0") =>
            post("inventory/movements", {
              unitId: unitA,
              productId: id,
              kind,
              quantity,
              cost,
              packaged: false,
              reason: "Teste de saldo fracionado",
              requestKey: randomUUID(),
            });
          assert.equal((await send("entry", "3", "0.333333")).status, 200);
          const results = await Promise.all([
            send("out", "2"),
            send("out", "2"),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          assert.equal((await send("out", "1")).status, 200);
          const d = await get("inventory/products/" + id + "?unitId=" + unitA);
          assert.equal(Number(d.data.product.stock.physical), 0);
          assert.equal(Number(d.data.product.stock.value), 0);
          assert.equal(d.data.movements.length, 3);
        },
      );
      await t.test(
        "conversão não representável é recusada sem criar saldo ou movimento",
        async () => {
          const created = await post("inventory/products/save", {
            ...productBody,
            code: "PRECISAO",
            name: "Produto de precisão",
            barcodes: [],
            packageFactor: "0.001",
          });
          assert.equal(created.status, 200);
          const r = await post("inventory/movements", {
            unitId: unitA,
            productId: created.data.id,
            kind: "entry",
            quantity: "0.001",
            cost: "3",
            packaged: true,
            reason: "Teste de conversão inválida",
            requestKey: randomUUID(),
          });
          assert.equal(r.status, 409);
          const d = await get(
            "inventory/products/" + created.data.id + "?unitId=" + unitA,
          );
          assert.equal(Number(d.data.product.stock.physical), 0);
          assert.equal(d.data.movements.length, 0);
        },
      );
      await t.test(
        "filial inativa bloqueia consulta e operação sem apagar movimentos",
        async () => {
          const before = (
            await f.admin.query(
              "SELECT count(*) FROM inventory.movements WHERE tenant_id=$1 AND unit_id=$2",
              [f.tenantA, unitB],
            )
          ).rows[0].count;
          await f.admin.query(
            "UPDATE organizations.units SET active=false WHERE tenant_id=$1 AND id=$2",
            [f.tenantA, unitB],
          );
          assert.equal(
            (await get("inventory/products?unitId=" + unitB)).status,
            404,
          );
          assert.equal(
            (
              await post("inventory/movements", {
                unitId: unitB,
                productId: product,
                kind: "entry",
                quantity: "1",
                cost: "3",
                packaged: false,
                reason: "Teste de unidade inativa",
                requestKey: randomUUID(),
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await f.admin.query(
                "SELECT count(*) FROM inventory.movements WHERE tenant_id=$1 AND unit_id=$2",
                [f.tenantA, unitB],
              )
            ).rows[0].count,
            before,
          );
        },
      );
    } finally {
      if (app) await app.close();
      await f.admin.end();
    }
  },
);
