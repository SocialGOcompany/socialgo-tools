/**
 * Testes do módulo de markup (precificação revendedor → preço de venda).
 *
 * Este é o "cascade" de markup que alimenta a precificação de sub-revenda
 * (money-critical). O módulo é exportado publicamente mas NÃO tem consumidor
 * dentro do repo ainda — estes testes travam o contrato matemático antes de
 * qualquer wire-up (cli/mcp) ligar a sub-revenda. Rodam via `node --test`
 * (com strip de tipos do Node ou após `pnpm build` apontando para o .ts via
 * tsx/ts-node — ver scripts do pacote).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMarkup, orderCost, resolveMarkup, type MarkupRule } from "./markup.js";

test("applyMarkup aplica multiplicador puro", () => {
  // 0.90 * 1.5 = 1.35
  assert.equal(applyMarkup(0.9, { multiplier: 1.5 }), 1.35);
});

test("applyMarkup soma acréscimo fixo por 1000", () => {
  // 0.90 * 1.5 + 0.20 = 1.55
  assert.equal(applyMarkup(0.9, { multiplier: 1.5, flatPer1000: 0.2 }), 1.55);
});

test("applyMarkup com flatPer1000=0 não altera o resultado (0 é override válido)", () => {
  assert.equal(applyMarkup(1, { multiplier: 2, flatPer1000: 0 }), 2);
});

test("applyMarkup arredonda para 2 casas (centavos)", () => {
  // 0.333 * 1.0 = 0.333 → 0.33
  assert.equal(applyMarkup(0.333, { multiplier: 1 }), 0.33);
  // 0.335 * 1.0 = 0.335 → 0.34 (half-up via Math.round)
  assert.equal(applyMarkup(0.335, { multiplier: 1 }), 0.34);
});

test("applyMarkup com multiplier 0 zera o preço base (categoria pode anular)", () => {
  assert.equal(applyMarkup(5, { multiplier: 0 }), 0);
  assert.equal(applyMarkup(5, { multiplier: 0, flatPer1000: 1 }), 1);
});

test("orderCost calcula custo por quantidade (rate é por 1000)", () => {
  // 1.35 por 1000 * 1000 unidades = 1.35
  assert.equal(orderCost(1.35, 1000), 1.35);
  // 1.35 por 1000 * 500 unidades = 0.675 → 0.68
  assert.equal(orderCost(1.35, 500), 0.68);
  // 2.00 por 1000 * 2500 = 5.00
  assert.equal(orderCost(2, 2500), 5);
});

test("orderCost com quantidade 0 = 0", () => {
  assert.equal(orderCost(1.35, 0), 0);
});

test("resolveMarkup: override de categoria vence o padrão do fornecedor", () => {
  const supplier: MarkupRule = { multiplier: 1.5, flatPer1000: 0.1 };
  const resolved = resolveMarkup(supplier, { multiplier: 2 });
  assert.deepEqual(resolved, { multiplier: 2, flatPer1000: 0.1 });
});

test("resolveMarkup: sem override usa o padrão do fornecedor", () => {
  const supplier: MarkupRule = { multiplier: 1.5, flatPer1000: 0.1 };
  assert.deepEqual(resolveMarkup(supplier), { multiplier: 1.5, flatPer1000: 0.1 });
});

test("resolveMarkup: override de flatPer1000=0 zera o acréscimo (0 != unset com ??)", () => {
  const supplier: MarkupRule = { multiplier: 1.5, flatPer1000: 0.5 };
  const resolved = resolveMarkup(supplier, { flatPer1000: 0 });
  // ?? trata 0 como definido, então o override 0 deve vencer o 0.5 do fornecedor.
  assert.equal(resolved.flatPer1000, 0);
  assert.equal(resolved.multiplier, 1.5);
});

test("resolveMarkup: override de multiplier=0 zera o multiplicador", () => {
  const supplier: MarkupRule = { multiplier: 1.5 };
  const resolved = resolveMarkup(supplier, { multiplier: 0 });
  assert.equal(resolved.multiplier, 0);
});

test("cascade ponta-a-ponta: resolveMarkup → applyMarkup → orderCost", () => {
  const supplier: MarkupRule = { multiplier: 1.2, flatPer1000: 0.1 };
  const rule = resolveMarkup(supplier, { multiplier: 1.5 });
  const sellRate = applyMarkup(0.9, rule); // 0.9*1.5 + 0.1 = 1.45
  assert.equal(sellRate, 1.45);
  const cost = orderCost(sellRate, 2000); // 1.45/1000 * 2000 = 2.90
  assert.equal(cost, 2.9);
});
