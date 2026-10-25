const test = require('node:test');
const assert = require('node:assert/strict');
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
process.env.MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'x';
process.env.MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || 'x';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'x';
const { calcularCartao } = require('../src/fidelidade');

test('cartão novo começa vazio', () => {
  const c = calcularCartao(0, 0, 10);
  assert.deepEqual([c.carimbos, c.faltam, c.brindes_disponiveis], [0, 10, 0]);
});

test('9 pedidos pagos: faltam 1 e ainda não há brinde', () => {
  const c = calcularCartao(9, 0, 10);
  assert.deepEqual([c.carimbos, c.faltam, c.brindes_disponiveis], [9, 1, 0]);
});

test('10 pedidos pagos: cartão cheio e 1 brinde disponível', () => {
  const c = calcularCartao(10, 0, 10);
  assert.deepEqual([c.carimbos, c.faltam, c.brindes_disponiveis], [10, 0, 1]);
});

test('brinde usado: cartão recomeça e não há brinde disponível', () => {
  const c = calcularCartao(11, 1, 10);
  assert.deepEqual([c.carimbos, c.faltam, c.brindes_disponiveis], [1, 9, 0]);
});

test('brinde reservado em pedido pendente não fica disponível de novo', () => {
  assert.equal(calcularCartao(10, 1, 10).brindes_disponiveis, 0);
});

test('20 pedidos pagos acumulam 2 brindes; usar 1 deixa 1', () => {
  assert.equal(calcularCartao(20, 0, 10).brindes_disponiveis, 2);
  assert.equal(calcularCartao(20, 1, 10).brindes_disponiveis, 1);
});

test('estorno que reduz os pagos nunca gera saldo negativo', () => {
  assert.equal(calcularCartao(9, 1, 10).brindes_disponiveis, 0);
});

test('cadastro exige senha de 8+ caracteres e aceite da política', () => {
  const { cadastroSchema } = require('../src/validacao');
  const base = { nome: 'Ana Souza', email: 'ANA@Email.com', telefone: '(21) 98592-9831', senha: '12345678', aceite: true };
  const ok = cadastroSchema.safeParse(base);
  assert.equal(ok.success, true);
  assert.equal(ok.data.email, 'ana@email.com');
  assert.equal(ok.data.telefone, '21985929831');
  assert.equal(cadastroSchema.safeParse({ ...base, senha: '1234567' }).success, false);
  assert.equal(cadastroSchema.safeParse({ ...base, aceite: false }).success, false);
  assert.equal(cadastroSchema.safeParse({ ...base, extra: 1 }).success, false);
});

test('login valida e-mail e exige senha', () => {
  const { loginSchema } = require('../src/validacao');
  assert.equal(loginSchema.safeParse({ email: 'a@b.co', senha: 'x' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'invalido', senha: 'x' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'a@b.co', senha: '' }).success, false);
});
