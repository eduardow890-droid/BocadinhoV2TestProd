const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const clientes = require('../clientes');
const fidelidade = require('../fidelidade');
const { cadastroSchema, loginSchema, formatarErros } = require('../validacao');

const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos.' }
});

// Só aceita corpo JSON (barreira extra contra envio de formulário de outro site).
const somenteJson = (req, res, next) =>
  req.is('application/json') ? next() : res.status(415).json({ erro: 'Requisição inválida.' });

router.use(clientes.carregarCliente);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

async function corpoConta(cliente) {
  return { cliente: clientes.publico(cliente), cartao: await fidelidade.cartaoDoCliente(db, cliente.id) };
}

router.post('/cadastro', limiteAuth, somenteJson, async (req, res, next) => {
  const r = cadastroSchema.safeParse(req.body);
  if (!r.success) return res.status(400).json(formatarErros(r.error));
  try {
    const cliente = await clientes.criarCliente(r.data);
    if (!cliente) return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Entre com sua senha.', campos: { email: 'E-mail já cadastrado.' } });
    await clientes.abrirSessao(res, cliente.id);
    res.status(201).json(await corpoConta(cliente));
  } catch (e) { next(e); }
});

router.post('/login', limiteAuth, somenteJson, async (req, res, next) => {
  const r = loginSchema.safeParse(req.body);
  if (!r.success) return res.status(400).json(formatarErros(r.error));
  try {
    const cliente = await clientes.autenticar(r.data.email, r.data.senha);
    if (!cliente) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    await clientes.abrirSessao(res, cliente.id);
    res.json(await corpoConta(cliente));
  } catch (e) { next(e); }
});

router.post('/logout', somenteJson, async (req, res, next) => {
  try { await clientes.encerrarSessao(req, res); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// Dados da conta + cartão fidelidade (e histórico recente de pedidos).
router.get('/', async (req, res, next) => {
  if (!req.cliente) return res.json({ cliente: null });
  try {
    const corpo = await corpoConta(req.cliente);
    corpo.pedidos = (await db.query(`SELECT id,status,total_centavos,brinde_fidelidade,criado_em
      FROM pedidos WHERE cliente_id=$1 ORDER BY criado_em DESC LIMIT 10`, [req.cliente.id])).rows
      .map(p => ({ ...p, codigo: p.id.slice(0, 8), criado_em: Number(p.criado_em) }));
    res.json(corpo);
  } catch (e) { next(e); }
});

module.exports = router;
