const cfg = require('./config');

// Pedidos que contam para o cartão: pagos e ainda válidos (estornados não contam).
const STATUS_CONTAM = ['pago', 'em_preparo', 'enviado', 'concluido'];
// Um brinde só volta a ficar disponível se o pedido que o reservou expirou ou foi cancelado.
const STATUS_LIBERAM_BRINDE = ['expirado', 'cancelado'];

/** Função pura: calcula o estado do cartão a partir das contagens. */
function calcularCartao(pedidosPagos, brindesUsados, meta = cfg.fidelidadeMeta) {
  const pagos = Math.max(0, Number(pedidosPagos) || 0);
  const usados = Math.max(0, Number(brindesUsados) || 0);
  const ganhos = Math.floor(pagos / meta);
  const disponiveis = Math.max(0, ganhos - usados);
  let carimbos = pagos % meta;
  if (disponiveis > 0 && carimbos === 0) carimbos = meta; // cartão cheio, aguardando o resgate
  return {
    meta,
    pedidos_pagos: pagos,
    carimbos,
    faltam: disponiveis > 0 && carimbos === meta ? 0 : meta - carimbos,
    brindes_disponiveis: disponiveis,
    brindes_usados: usados
  };
}

/** Lê as contagens do cliente. `executor` pode ser o db ou um client de transação. */
async function cartaoDoCliente(executor, clienteId) {
  const r = (await executor.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = ANY($2))::int AS pagos,
      COUNT(*) FILTER (WHERE brinde_fidelidade AND NOT (status = ANY($3)))::int AS usados
    FROM pedidos WHERE cliente_id = $1`,
  [clienteId, STATUS_CONTAM, STATUS_LIBERAM_BRINDE])).rows[0];
  return calcularCartao(r.pagos, r.usados);
}

module.exports = { calcularCartao, cartaoDoCliente, STATUS_CONTAM, STATUS_LIBERAM_BRINDE };
