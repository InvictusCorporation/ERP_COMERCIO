import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authDatabase } from "../support/auth-database.mjs";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  newMfaSecret,
  encrypt,
  totp,
} from "../../apps/api/dist/modules/identity/crypto.js";
test(
  "Fornecedores e compras reais: aprovação, recebimento, custos e acesso",
  { timeout: 120000 },
  async (t) => {
    const f = await authDatabase();
    let app,
      url,
      owner,
      normal,
      supplier,
      unit,
      unitB,
      product,
      productB,
      order,
      receipt;
    const req = async (path, s, b, extra = {}) => {
      const r = await fetch(url + path, {
        method: b === undefined ? "GET" : "POST",
        headers: {
          ...(b === undefined
            ? {}
            : { "Content-Type": "application/json", Origin: f.config.origin }),
          ...(s ? { Cookie: s.cookie, "X-CSRF-Token": s.data.csrf } : {}),
          ...extra,
        },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    };
    const post = (p, b, s = owner) => req(p, s, b),
      get = (p, s = owner) => req(p, s);
    const sup = {
      legalName: "Distribuidora de Teste Ltda.",
      name: "Distribuidora Alpha",
      cnpj: "12ABC34501DE35",
      stateRegistration: "",
      contactName: "Contato fictício",
      email: "fornecedor@example.invalid",
      phone: "",
      address: "",
      city: "Fortaleza",
      state: "CE",
      postalCode: "",
      deliveryDays: 3,
      paymentTerms: "28 dias",
      notes: "Cadastro fictício de teste",
      active: true,
    };
    const prod = {
      code: "ARROZ",
      name: "Arroz teste",
      description: "",
      category: "Mercearia",
      brand: "",
      baseUnit: "UN",
      packageName: "Fardo",
      packageFactor: "10",
      barcodes: [],
      salePrice: "5",
      desiredMargin: "40",
      minimumMargin: "20",
      minimumStock: "20",
      idealStock: "100",
      active: true,
    };
    const draft = (extra = {}) => ({
      unitId: unit,
      supplierId: supplier,
      items: [
        { productId: product, quantity: "100", unitCost: "3", packaged: false },
      ],
      freight: "0",
      extraCost: "0",
      discount: "0",
      expectedDate: "2026-12-10",
      notes: "Pedido fictício",
      requestKey: randomUUID(),
      ...extra,
    });
    const detail = async (id = order) => {
      const r = await get("purchasing/orders/" + id);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data;
    };
    const stock = async (id = product, branch = unit) => {
      const r = await get("inventory/products/" + id + "?unitId=" + branch);
      assert.equal(r.status, 200);
      return r.data;
    };
    const receive = async (id, items, extra = {}) => {
      const d = await detail(id);
      return post("purchasing/receipts", {
        orderId: id,
        version: d.order.version,
        items,
        document: "REC-TESTE",
        notes: "Conferência física de teste",
        requestKey: randomUUID(),
        ...extra,
      });
    };
    const approve = async (id) => {
      const d = await detail(id);
      return post("purchasing/orders/transition", {
        id,
        version: d.order.version,
        action: "approve",
        reason: "",
      });
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
      assert.equal(owner.status, 200);
      normal = await post(
        "auth/login",
        { email: f.users.normal.email, password: f.users.normal.password },
        null,
      );
      const company = await post("organizations/companies/save", {
        legalName: "Loja teste",
        tradeName: "Loja Matriz",
        cnpj: "12ABC34501DE35",
        matrixCode: "MAT",
        active: true,
      });
      unit = company.data.matrixId;
      const branch = await post("organizations/units/save", {
        companyId: company.data.id,
        parentId: unit,
        kind: "filial",
        code: "B",
        name: "Loja B",
        cnpj: null,
        active: true,
      });
      unitB = branch.data.id;
      product = (await post("inventory/products/save", prod)).data.id;
      productB = (
        await post("inventory/products/save", {
          ...prod,
          code: "LEITE",
          name: "Leite teste",
        })
      ).data.id;
      await t.test(
        "fornecedor central, CNPJ único/imutável, validações, versão e isolamento",
        async () => {
          const r = await post("purchasing/suppliers/save", sup);
          assert.equal(r.status, 200, JSON.stringify(r.data));
          supplier = r.data.id;
          assert.equal(
            (await post("purchasing/suppliers/save", sup)).status,
            409,
          );
          assert.equal(
            (await post("purchasing/suppliers/save", { ...sup, cnpj: "123" }))
              .status,
            400,
          );
          assert.equal(
            (
              await post("purchasing/suppliers/save", {
                ...sup,
                id: supplier,
                version: 99,
              })
            ).status,
            409,
          );
          assert.equal((await get("purchasing/suppliers", normal)).status, 403);
          assert.equal((await get("purchasing/suppliers", null)).status, 401);
          assert.equal(
            (
              await post("purchasing/suppliers/save", {
                ...sup,
                id: supplier,
                version: 1,
                cnpj: "11222333000181",
              })
            ).status,
            409,
          );
          assert.equal(
            (await get("purchasing/suppliers?query=Alpha")).data.total,
            1,
          );
          for (const headers of [
            { "X-CSRF-Token": "" },
            { Origin: "https://externo.example.invalid" },
            { "Sec-Fetch-Site": "cross-site" },
          ])
            assert.equal(
              (await req("purchasing/suppliers/save", owner, sup, headers))
                .status,
              403,
            );
        },
      );
      await t.test(
        "rascunho não movimenta estoque; confirmação é idempotente e versão protege edição",
        async () => {
          const input = draft(),
            a = await post("purchasing/orders/save", input),
            b = await post("purchasing/orders/save", input);
          assert.equal(a.status, 200, JSON.stringify(a.data));
          assert.equal(b.data.id, a.data.id);
          order = a.data.id;
          assert.equal(
            (
              await post("purchasing/orders/save", {
                ...input,
                notes: "Outro conteúdo",
              })
            ).status,
            409,
          );
          assert.equal(Number((await stock()).product.stock.physical), 0);
          let d = await detail();
          assert.equal(d.order.status, "draft");
          assert.equal(Number(d.order.total), 300);
          assert.equal(
            (
              await post("purchasing/orders/save", {
                ...input,
                id: order,
                version: 99,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await receive(order, [
                { lineId: d.order.items[0].id, quantity: "10" },
              ])
            ).status,
            409,
          );
        },
      );
      await t.test(
        "aprovação congela custo e impede edição; recebimento parcial atualiza apenas o conferido",
        async () => {
          assert.equal((await approve(order)).status, 200);
          let d = await detail();
          assert.equal(d.order.status, "approved");
          assert.equal(
            (
              await post("purchasing/orders/save", {
                ...draft(),
                id: order,
                version: d.order.version,
              })
            ).status,
            409,
          );
          const r = await receive(order, [
            { lineId: d.order.items[0].id, quantity: "40" },
          ]);
          assert.equal(r.status, 200, JSON.stringify(r.data));
          receipt = r.data.id;
          d = await detail();
          assert.equal(d.order.status, "partial");
          assert.equal(Number(d.order.items[0].receivedQuantity), 40);
          assert.equal(Number((await stock()).product.stock.value), 120);
          assert.equal(
            (
              await receive(order, [
                { lineId: d.order.items[0].id, quantity: "61" },
              ])
            ).status,
            409,
          );
          assert.equal(
            (
              await post("purchasing/orders/transition", {
                id: order,
                version: d.order.version,
                action: "cancel",
                reason: "Cancelar indevidamente",
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "repetição de recebimento não duplica entrada e conclusão conserva total/custo histórico",
        async () => {
          let d = await detail();
          const input = {
            orderId: order,
            version: d.order.version,
            items: [{ lineId: d.order.items[0].id, quantity: "60" }],
            document: "REC-2",
            notes: "Saldo conferido",
            requestKey: randomUUID(),
          };
          const a = await post("purchasing/receipts", input),
            b = await post("purchasing/receipts", input);
          assert.equal(a.status, 200);
          assert.equal(b.data.id, a.data.id);
          assert.equal(
            (await post("purchasing/receipts", { ...input, document: "Outro" }))
              .status,
            409,
          );
          d = await detail();
          assert.equal(d.order.status, "received");
          assert.equal(Number((await stock()).product.stock.value), 300);
          assert.equal(d.receipts.length, 2);
          assert.equal((await receive(order, input.items)).status, 409);
          const second = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: product,
                  quantity: "100",
                  unitCost: "4",
                  packaged: false,
                },
              ],
            }),
          );
          assert.equal((await approve(second.data.id)).status, 200);
          d = await detail(second.data.id);
          assert.equal(
            (
              await receive(second.data.id, [
                { lineId: d.order.items[0].id, quantity: "100" },
              ])
            ).status,
            200,
          );
          const s = await stock();
          assert.equal(Number(s.product.stock.physical), 200);
          assert.equal(Number(s.product.stock.value), 700);
          assert.equal(Number(s.product.stock.averageCost), 3.5);
          assert.equal(Number(s.product.salePrice), 5);
        },
      );
      await t.test(
        "rateio cumulativo conserva frete/despesas/desconto e fator histórico mesmo após mudar embalagem",
        async () => {
          const r = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: productB,
                  quantity: "3",
                  unitCost: "0.333333",
                  packaged: true,
                },
              ],
              freight: "0.01",
              extraCost: "0.02",
              discount: "0.01",
            }),
          );
          assert.equal(r.status, 200);
          const id = r.data.id;
          assert.equal((await approve(id)).status, 200);
          const p = (await stock(productB)).product;
          const { stock: ignored, ...input } = p;
          assert.equal(
            (
              await post("inventory/products/save", {
                ...input,
                packageFactor: "20",
              })
            ).status,
            200,
          );
          let total = 0;
          for (let n = 0; n < 3; n++) {
            const d = await detail(id),
              received = await receive(id, [
                { lineId: d.order.items[0].id, quantity: "1" },
              ]);
            assert.equal(received.status, 200, JSON.stringify(received.data));
            total += Number((await detail(id)).receipts[0].total);
          }
          const d = await detail(id),
            s = await stock(productB);
          assert.equal(d.order.status, "received");
          assert.equal(Number(s.product.stock.physical), 30);
          assert.equal(Number(s.product.stock.value), Number(d.order.total));
          assert.ok(Math.abs(total - Number(d.order.total)) < 1e-9);
          assert.equal(Number(d.order.items[0].factor), 10);
        },
      );
      await t.test(
        "estorno pela compra é atômico e o movimento não pode ser estornado isoladamente",
        async () => {
          const d = await detail(),
            last = (await stock()).movements[0];
          assert.equal(
            (
              await post("inventory/movements", {
                unitId: unit,
                productId: product,
                kind: "reverse",
                quantity: "1",
                packaged: false,
                cost: "0",
                reason: "Estorno isolado indevido",
                reversalOf: last.id,
                requestKey: randomUUID(),
              })
            ).status,
            409,
          );
          const second = (
            await get("purchasing/orders?status=received")
          ).data.items.find(
            (o) => o.id !== order && o.items[0].productId === product,
          );
          let current = await detail(second.id);
          const input = {
            id: current.receipts[0].id,
            version: current.order.version,
            reason: "Recebimento registrado por engano",
            requestKey: randomUUID(),
          };
          assert.equal(
            (await post("purchasing/receipts/reverse", input)).status,
            200,
          );
          assert.equal(
            (await post("purchasing/receipts/reverse", input)).status,
            200,
          );
          current = await detail(second.id);
          assert.equal(current.receipts[0].status, "reversed");
          assert.equal(current.order.status, "approved");
          assert.equal(Number((await stock()).product.stock.physical), 100);
          assert.equal(Number((await stock()).product.stock.value), 300);
          // O primeiro recebimento ficou no passado: o estorno deve falhar sem alterar pedido/saldo.
          assert.equal(
            (
              await post("purchasing/receipts/reverse", {
                id: receipt,
                version: d.order.version,
                reason: "Estorno antigo indevido",
                requestKey: randomUUID(),
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "cancelamento preserva pedido e não altera estoque; inativos não podem ser usados",
        async () => {
          const r = await post("purchasing/orders/save", draft());
          let d = await detail(r.data.id);
          assert.equal(
            (
              await post("purchasing/orders/transition", {
                id: r.data.id,
                version: d.order.version,
                action: "cancel",
                reason: "Pedido duplicado identificado",
              })
            ).status,
            200,
          );
          d = await detail(r.data.id);
          assert.equal(d.order.status, "cancelled");
          assert.equal((await approve(r.data.id)).status, 409);
          let s = (await get("purchasing/suppliers/" + supplier)).data;
          await post("purchasing/suppliers/save", { ...s, active: false });
          assert.equal(
            (await post("purchasing/orders/save", draft())).status,
            409,
          );
          s = (await get("purchasing/suppliers/" + supplier)).data;
          await post("purchasing/suppliers/save", { ...s, active: true });
        },
      );
      await t.test(
        "falha na auditoria reverte recebimento, custo, saldo e estado do pedido",
        async () => {
          const r = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: product,
                  quantity: "2",
                  unitCost: "5",
                  packaged: false,
                },
              ],
            }),
          );
          await approve(r.data.id);
          const d = await detail(r.data.id),
            before = (await stock()).product.stock;
          await f.admin.query(
            "CREATE FUNCTION audit.reject_purchase_test() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $fn$",
          );
          await f.admin.query(
            "CREATE TRIGGER reject_purchase_test BEFORE INSERT ON audit.events FOR EACH ROW WHEN (NEW.action='purchase.changed') EXECUTE FUNCTION audit.reject_purchase_test()",
          );
          try {
            assert.equal(
              (
                await receive(r.data.id, [
                  { lineId: d.order.items[0].id, quantity: "2" },
                ])
              ).status,
              503,
            );
          } finally {
            await f.admin.query(
              "DROP TRIGGER reject_purchase_test ON audit.events",
            );
          }
          assert.deepEqual((await stock()).product.stock, before);
          const after = await detail(r.data.id);
          assert.equal(after.order.status, "approved");
          assert.equal(after.receipts.length, 0);
        },
      );
      await t.test(
        "recebimentos concorrentes confirmam uma vez e recusam versão obsoleta",
        async () => {
          const r = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: product,
                  quantity: "5",
                  unitCost: "3",
                  packaged: false,
                },
              ],
            }),
          );
          await approve(r.data.id);
          const d = await detail(r.data.id);
          const input = {
            orderId: r.data.id,
            version: d.order.version,
            items: [{ lineId: d.order.items[0].id, quantity: "5" }],
            document: "REC-CONCORRENTE",
            notes: "Conferência em paralelo",
            requestKey: randomUUID(),
          };
          const a = await Promise.all([
            post("purchasing/receipts", input),
            post("purchasing/receipts", input),
          ]);
          assert.ok(a.every((r) => r.status === 200));
          assert.equal(a[0].data.id, a[1].data.id);
          assert.equal((await detail(r.data.id)).receipts.length, 1);
        },
      );
      await t.test(
        "permissões por filial, sem soma entre redes e sem escrita direta do ledger",
        async () => {
          await post("access/roles/save", {
            name: "Consulta compras B",
            permissions: [
              "organizations.read",
              "products.read",
              "suppliers.read",
              "purchases.read",
            ],
          });
          const role = (
            await f.admin.query(
              "SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2",
              [f.tenantA, "Consulta compras B"],
            )
          ).rows[0].id;
          await f.admin.query(
            "UPDATE identity.memberships SET role_id=$1,all_units=false WHERE tenant_id=$2 AND user_id=$3",
            [role, f.tenantA, f.users.normal.id],
          );
          await f.admin.query(
            "INSERT INTO organizations.membership_units SELECT tenant_id,id,$1 FROM identity.memberships WHERE tenant_id=$2 AND user_id=$3",
            [unitB, f.tenantA, f.users.normal.id],
          );
          assert.equal((await get("purchasing/orders", normal)).data.total, 0);
          assert.equal(
            (await get("purchasing/orders/" + order, normal)).status,
            404,
          );
          assert.equal(
            (
              await post(
                "purchasing/orders/save",
                draft({ unitId: unitB }),
                normal,
              )
            ).status,
            403,
          );
          assert.equal((await get("purchasing/suppliers", normal)).status, 200);
          const other = await post(
            "auth/login",
            { email: f.users.other.email, password: f.users.other.password },
            null,
          );
          assert.equal(
            (await get("purchasing/suppliers/" + supplier, other)).status,
            403,
          );
          const grants = (
            await f.admin.query(
              "SELECT has_table_privilege('invictus_auth','purchasing.orders','INSERT') AS insert,has_table_privilege('invictus_auth','purchasing.receipts','UPDATE') AS update,has_table_privilege('invictus_auth','purchasing.suppliers','DELETE') AS delete",
            )
          ).rows[0];
          assert.deepEqual(grants, {
            insert: false,
            update: false,
            delete: false,
          });
        },
      );
      await t.test(
        "snapshots e auditoria preservam fornecedor e custos sem reescrever o passado",
        async () => {
          const s = (await get("purchasing/suppliers/" + supplier)).data;
          await post("purchasing/suppliers/save", {
            ...s,
            name: "Fornecedor renomeado",
          });
          assert.equal(
            (await detail()).order.supplier.name,
            "Distribuidora Alpha",
          );
          const events = await get("audit/events?category=purchases");
          assert.equal(events.status, 200);
          assert.ok(
            events.data.items.some((e) => e.action === "receipt.created"),
          );
          assert.equal((await get("purchasing/orders?page=-1")).status, 400);
          assert.equal(
            (
              await post("purchasing/orders/save", {
                ...draft(),
                tenantId: f.tenantB,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post(
                "purchasing/orders/save",
                draft({ expectedDate: "2026-02-30" }),
              )
            ).status,
            400,
          );
          assert.equal(
            (await post("purchasing/orders/save", draft({ discount: "99999" })))
              .status,
            409,
          );
        },
      );
      await t.test(
        "comprador e conferente limitados à filial têm MFA e ações separadas",
        async () => {
          const queryRole = async (name) =>
            (
              await f.admin.query(
                "SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2",
                [f.tenantA, name],
              )
            ).rows[0].id;
          await post("access/roles/save", {
            name: "Comprador B",
            permissions: [
              "organizations.read",
              "products.read",
              "suppliers.read",
              "purchases.read",
              "purchases.manage",
            ],
          });
          const buyerRole = await queryRole("Comprador B");
          const member = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
              [f.tenantA, f.users.normal.id],
            )
          ).rows[0].id;
          await post("access/members/change", {
            id: member,
            roleId: buyerRole,
            active: true,
            allUnits: false,
            unitIds: [unitB],
          });
          assert.equal((await get("purchasing/orders", normal)).status, 403);
          const setup = await post("auth/mfa/enroll", {}, normal);
          assert.equal(setup.status, 200);
          normal = await post(
            "auth/mfa/verify",
            { code: totp(setup.data.secret, f.users.normal.email).generate() },
            normal,
          );
          assert.equal(normal.status, 200);
          const created = await post(
            "purchasing/orders/save",
            draft({ unitId: unitB }),
            normal,
          );
          assert.equal(created.status, 200, JSON.stringify(created.data));
          let d = (await get("purchasing/orders/" + created.data.id, normal))
            .data;
          assert.equal(
            (
              await post(
                "purchasing/orders/transition",
                {
                  id: created.data.id,
                  version: d.order.version,
                  action: "approve",
                  reason: "",
                },
                normal,
              )
            ).status,
            403,
          );
          assert.equal(
            (await post("purchasing/orders/save", draft(), normal)).status,
            403,
          );
          await approve(created.data.id);
          d = await detail(created.data.id);
          const body = {
            orderId: created.data.id,
            version: d.order.version,
            items: [{ lineId: d.order.items[0].id, quantity: "1" }],
            document: "REC-B",
            notes: "Conferência autorizada filial B",
            requestKey: randomUUID(),
          };
          assert.equal(
            (await post("purchasing/receipts", body, normal)).status,
            403,
          );
          await post("access/roles/save", {
            name: "Conferente B",
            permissions: [
              "organizations.read",
              "products.read",
              "stock.read",
              "stock.manage",
              "suppliers.read",
              "purchases.read",
              "purchases.receive",
            ],
          });
          const receiverRole = await queryRole("Conferente B");
          await post("access/members/change", {
            id: member,
            roleId: receiverRole,
            active: true,
            allUnits: false,
            unitIds: [unitB],
          });
          assert.equal(
            (await post("purchasing/receipts", body, normal)).status,
            200,
          );
          assert.equal(
            (await get("purchasing/orders/" + order, normal)).status,
            404,
          );
          assert.equal(
            (
              await post(
                "purchasing/suppliers/save",
                { ...sup, name: "Sem poder global" },
                normal,
              )
            ).status,
            403,
          );
          await post("access/members/change", {
            id: member,
            roleId: await queryRole("Consulta compras B"),
            active: true,
            allUnits: false,
            unitIds: [unitB],
          });
          d = await detail(created.data.id);
          assert.equal(
            (
              await post(
                "purchasing/receipts",
                { ...body, version: d.order.version, requestKey: randomUUID() },
                normal,
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "histórico de recebimentos é paginado e inativação de unidade bloqueia sem apagar",
        async () => {
          const r = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: productB,
                  quantity: "21",
                  unitCost: "1",
                  packaged: false,
                },
              ],
            }),
          );
          await approve(r.data.id);
          for (let n = 0; n < 21; n++) {
            const d = await detail(r.data.id);
            assert.equal(
              (
                await receive(
                  r.data.id,
                  [{ lineId: d.order.items[0].id, quantity: "1" }],
                  { document: "ENTREGA-" + n },
                )
              ).status,
              200,
            );
          }
          const first = await detail(r.data.id),
            second = (await get("purchasing/orders/" + r.data.id + "?page=1"))
              .data;
          assert.equal(first.receiptTotal, 21);
          assert.equal(first.receipts.length, 20);
          assert.equal(second.receipts.length, 1);
          assert.equal(
            (await get("purchasing/orders/" + r.data.id + "?page=-1")).status,
            400,
          );
          await f.admin.query(
            "UPDATE organizations.units SET active=false WHERE tenant_id=$1 AND id=$2",
            [f.tenantA, unitB],
          );
          assert.equal(
            (await get("purchasing/orders?unitId=" + unitB)).status,
            404,
          );
          const history = await get("audit/events?category=purchases");
          assert.equal(history.status, 200);
        },
      );
      await t.test(
        "aumento de custo gera alerta e sugestão sem alterar preço de venda",
        async () => {
          const created = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: product,
                  quantity: "100",
                  unitCost: "20",
                  packaged: false,
                },
              ],
            }),
          );
          await approve(created.data.id);
          const d = await detail(created.data.id);
          const r = await receive(created.data.id, [
            { lineId: d.order.items[0].id, quantity: "100" },
          ]);
          assert.equal(r.status, 200);
          const warning = r.data.warnings.find((w) => w.id === product);
          assert.ok(warning);
          assert.ok(Number(warning.margin) < Number(warning.targetMargin));
          assert.ok(
            Number(warning.suggestedPrice) > Number(warning.averageCost),
          );
          assert.equal(Number((await stock()).product.salePrice), 5);
        },
      );
      await t.test(
        "rateio entre produtos e estorno com falha em um item revertem o conjunto inteiro",
        async () => {
          const created = await post(
            "purchasing/orders/save",
            draft({
              items: [
                {
                  productId: product,
                  quantity: "1",
                  unitCost: "1",
                  packaged: false,
                },
                {
                  productId: productB,
                  quantity: "1",
                  unitCost: "3",
                  packaged: false,
                },
              ],
              freight: "0.01",
            }),
          );
          assert.equal(created.status, 200);
          await approve(created.data.id);
          let d = await detail(created.data.id);
          assert.deepEqual(
            d.order.items.map((i) => Number(i.totalValue)),
            [1.0025, 3.0075],
          );
          const r = await receive(
            created.data.id,
            d.order.items.map((i) => ({ lineId: i.id, quantity: "1" })),
          );
          assert.equal(r.status, 200);
          d = await detail(created.data.id);
          assert.equal(Number(d.receipts[0].total), 4.01);
          assert.equal(
            (
              await post("inventory/movements", {
                unitId: unit,
                productId: productB,
                kind: "out",
                quantity: "1",
                cost: "0",
                packaged: false,
                reason: "Saída após o recebimento",
                requestKey: randomUUID(),
              })
            ).status,
            200,
          );
          const beforeA = (await stock()).product.stock,
            beforeB = (await stock(productB)).product.stock;
          assert.equal(
            (
              await post("purchasing/receipts/reverse", {
                id: r.data.id,
                version: d.order.version,
                reason: "Estorno integral não permitido",
                requestKey: randomUUID(),
              })
            ).status,
            409,
          );
          assert.deepEqual((await stock()).product.stock, beforeA);
          assert.deepEqual((await stock(productB)).product.stock, beforeB);
          const after = await detail(created.data.id);
          assert.equal(after.receipts[0].status, "confirmed");
          assert.equal(after.order.status, "received");
        },
      );
    } finally {
      if (app) await app.close();
      await f.admin.end();
    }
  },
);
