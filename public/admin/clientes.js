/* Painel admin: aba "Clientes cadastrados". Usa window.AdminApi (definido em admin.js). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  let carregado = false, pagina = 1, total = 0, limite = 20, busca = '', timer = 0;

  function aba(nome) {
    const clientes = nome === 'clientes';
    $('view-pedidos').hidden = clientes;
    $('view-clientes').hidden = !clientes;
    $('tab-pedidos').setAttribute('aria-selected', String(!clientes));
    $('tab-clientes').setAttribute('aria-selected', String(clientes));
    if (clientes && !carregado) { carregado = true; carregar(); }
  }

  function mensagem(texto, erro) {
    const n = $('cli-msg');
    n.textContent = texto || '';
    n.className = 'message' + (erro ? ' error' : '');
    n.hidden = !texto;
  }

  const foneBonito = t => t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t;

  async function carregarPedidos(cliente, destino) {
    destino.replaceChildren(el('p', 'Carregando pedidos…', 'muted'));
    try {
      const pedidos = await window.AdminApi.requisicao(`/api/admin/clientes/${encodeURIComponent(cliente.id)}/pedidos`);
      destino.replaceChildren();
      if (!pedidos.length) { destino.append(el('p', 'Nenhum pedido feito logado.', 'muted')); return; }
      const ul = el('ul', undefined, 'cliente-pedidos');
      pedidos.forEach(p => {
        const li = el('li');
        li.append(
          el('span', `#${p.codigo} · ${window.AdminApi.dataHora(p.criado_em)}${p.brinde_fidelidade ? ' · 🎁' : ''}`),
          el('span', `${window.AdminApi.dinheiro(p.total_centavos)} · ${window.AdminApi.textoStatus(p.status)}`)
        );
        ul.append(li);
      });
      destino.append(ul);
    } catch (e) { destino.replaceChildren(el('p', e.message, 'message error')); }
  }

  function detalhe(cliente) {
    const box = el('div', undefined, 'cliente-detalhe');
    box.append(el('h4', 'Dados de contato'));
    box.append(el('p', `E-mail: ${cliente.email}`), el('p', `Telefone: ${foneBonito(cliente.telefone)}`));
    const acoes = el('div', undefined, 'cliente-acoes');
    const wa = el('a', 'Abrir WhatsApp', 'button secondary');
    wa.href = `https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`;
    wa.target = '_blank'; wa.rel = 'noopener noreferrer';
    const copiar = el('button', 'Copiar e-mail', 'button secondary');
    copiar.type = 'button';
    copiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cliente.email); copiar.textContent = 'E-mail copiado!'; }
      catch (_) { copiar.textContent = 'Copie manualmente'; }
      setTimeout(() => { copiar.textContent = 'Copiar e-mail'; }, 2000);
    });
    acoes.append(wa, copiar);
    box.append(acoes, el('h4', 'Últimos pedidos'));
    const pedidos = el('div');
    box.append(pedidos);
    carregarPedidos(cliente, pedidos);
    return box;
  }

  function cartao(c) {
    const card = el('article', undefined, 'cliente-card');
    const topo = el('div', undefined, 'cliente-topo');
    const info = el('div');
    info.append(el('h3', c.nome), el('p', `Cadastro em ${new Date(c.criado_em).toLocaleDateString('pt-BR')}`, 'muted'));
    const botao = el('button', 'Contato e pedidos', 'button secondary');
    botao.type = 'button'; botao.setAttribute('aria-expanded', 'false');
    let aberto = null;
    botao.addEventListener('click', () => {
      if (aberto) { aberto.remove(); aberto = null; botao.setAttribute('aria-expanded', 'false'); return; }
      aberto = detalhe(c); card.append(aberto); botao.setAttribute('aria-expanded', 'true');
    });
    topo.append(info, botao);
    const badges = el('div', undefined, 'cliente-badges');
    const k = c.cartao;
    badges.append(
      el('span', `Pedidos: ${c.pedidos}`),
      el('span', `Pagos: ${k.pedidos_pagos}`),
      el('span', `Carimbos: ${k.carimbos}/${k.meta}`),
      el('span', `Brindes disponíveis: ${k.brindes_disponiveis}`)
    );
    card.append(topo, badges);
    return card;
  }

  async function carregar() {
    mensagem('');
    try {
      const [resumo, lista] = await Promise.all([
        window.AdminApi.requisicao('/api/admin/clientes/resumo'),
        window.AdminApi.requisicao(`/api/admin/clientes?pagina=${pagina}&busca=${encodeURIComponent(busca)}`)
      ]);
      $('cli-total').textContent = String(resumo.total);
      $('cli-7d').textContent = String(resumo.novos_7d);
      $('cli-30d').textContent = String(resumo.novos_30d);
      $('cli-pedidos').textContent = String(resumo.pedidos_de_clientes);
      total = lista.total; limite = lista.limite;
      const alvo = $('cli-lista');
      alvo.replaceChildren();
      if (!lista.clientes.length) alvo.append(el('p', busca ? 'Nenhum cliente encontrado.' : 'Ainda não há clientes cadastrados.', 'empty'));
      lista.clientes.forEach(c => alvo.append(cartao(c)));
      const paginas = Math.max(1, Math.ceil(total / limite));
      $('cli-pagina').textContent = `Página ${pagina} de ${paginas} · ${total} cliente(s)`;
      $('cli-anterior').disabled = pagina <= 1;
      $('cli-proxima').disabled = pagina >= paginas;
    } catch (e) { mensagem(e.message, true); }
  }

  $('tab-pedidos').addEventListener('click', () => aba('pedidos'));
  $('tab-clientes').addEventListener('click', () => aba('clientes'));
  $('cli-atualizar').addEventListener('click', carregar);
  $('cli-anterior').addEventListener('click', () => { pagina = Math.max(1, pagina - 1); carregar(); });
  $('cli-proxima').addEventListener('click', () => { pagina += 1; carregar(); });
  $('cli-busca').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { busca = e.target.value.trim(); pagina = 1; carregar(); }, 350);
  });
  $('logout-button').addEventListener('click', () => { carregado = false; aba('pedidos'); });
})();
