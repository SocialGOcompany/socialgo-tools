/** Regras de markup: preço do fornecedor (por 1000) → preço de venda. */

export interface MarkupRule {
  /** multiplicador global (ex.: 1.5 = +50%) */
  multiplier: number;
  /** acréscimo fixo por 1000 (na moeda de venda), opcional */
  flatPer1000?: number;
}

/** Aplica markup sobre a `rate` (por 1000) do fornecedor. */
export function applyMarkup(supplierRatePer1000: number, rule: MarkupRule): number {
  const base = supplierRatePer1000 * rule.multiplier + (rule.flatPer1000 ?? 0);
  return Math.round(base * 100) / 100;
}

/** Custo de um pedido a partir do preço por 1000 e quantidade. */
export function orderCost(ratePer1000: number, quantity: number): number {
  return Math.round((ratePer1000 / 1000) * quantity * 100) / 100;
}

/**
 * Resolve o markup efetivo em cascata para precificação em massa:
 * override da categoria > padrão do fornecedor. Permite repreçar milhares
 * de serviços de uma vez mudando uma única regra.
 */
export function resolveMarkup(
  supplier: MarkupRule,
  categoryOverride?: Partial<MarkupRule>,
): MarkupRule {
  return {
    multiplier: categoryOverride?.multiplier ?? supplier.multiplier,
    flatPer1000: categoryOverride?.flatPer1000 ?? supplier.flatPer1000,
  };
}
