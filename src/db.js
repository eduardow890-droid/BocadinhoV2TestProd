const fs = require('fs');
const { Pool } = require('pg');
const cfg = require('./config');
const produtos = require('./produtos');

if (!cfg.databaseUrl) throw new Error('DATABASE_URL ausente. Configure a conexão PostgreSQL do Supabase no .env.');

const databaseUrl = new URL(cfg.databaseUrl);
const usarTls = cfg.producao || process.env.DB_SSL !== 'false';
let ssl;
if (usarTls) {
  const caPath = process.env.DB_SSL_CA?.trim();
  if (cfg.producao && !caPath) {
    throw new Error('DB_SSL_CA ausente. Configure o certificado raiz do PostgreSQL para validar a conexão em produção.');
  }
  if (caPath) {
    let ca;
    try {
      ca = fs.readFileSync(caPath, 'utf8');
    } catch (e) {
      throw new Error(`Não foi possível ler DB_SSL_CA em ${caPath}: ${e.message}`);
    }
    ssl = { ca, rejectUnauthorized: true };
  } else {
    // Fora de produção, preserve o comportamento compatível com bancos locais.
    ssl = true;
  }
  // Evita que parâmetros SSL da URL sobrescrevam a configuração explícita acima.
  databaseUrl.searchParams.delete('sslmode');
  databaseUrl.searchParams.delete('sslrootcert');
} else {
  databaseUrl.searchParams.delete('sslmode');
  databaseUrl.searchParams.delete('sslrootcert');
}

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30000
});

const query = (text, params = []) => pool.query(text, params);

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '',
      preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0), ativo BOOLEAN NOT NULL DEFAULT TRUE,
      imagem_url TEXT, imagem_path TEXT, esgotado BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id UUID PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL, telefone TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrega','retirada')), regiao TEXT NOT NULL,
      cidade TEXT NOT NULL DEFAULT '', rua TEXT NOT NULL DEFAULT '', numero TEXT NOT NULL DEFAULT '',
      complemento TEXT NOT NULL DEFAULT '', endereco TEXT NOT NULL DEFAULT '', obs TEXT NOT NULL DEFAULT '',
      total_centavos INTEGER NOT NULL CHECK (total_centavos > 0), status TEXT NOT NULL DEFAULT 'pendente',
      criado_em BIGINT NOT NULL, expira_em BIGINT NOT NULL, pago_em BIGINT
    );
    CREATE TABLE IF NOT EXISTS pedido_itens (
      id BIGSERIAL PRIMARY KEY, pedido_id UUID NOT NULL REFERENCES pedidos(id), produto_id TEXT NOT NULL,
      nome TEXT NOT NULL, qtd INTEGER NOT NULL CHECK (qtd BETWEEN 1 AND 99), preco_unit_centavos INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pagamentos (
      id BIGSERIAL PRIMARY KEY, pedido_id UUID NOT NULL REFERENCES pedidos(id), mp_payment_id TEXT NOT NULL UNIQUE,
      mp_order_id TEXT, status TEXT NOT NULL, valor_centavos INTEGER NOT NULL, qr_code TEXT, qr_base64 TEXT, criado_em BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eventos_webhook (
      id BIGSERIAL PRIMARY KEY, request_id TEXT, tipo TEXT, referencia TEXT, criado_em BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tentativas_cobranca (
      pedido_id UUID PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
      chave_idempotencia TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL DEFAULT 'pendente',
      tentativas INTEGER NOT NULL DEFAULT 0,
      proxima_tentativa BIGINT NOT NULL DEFAULT 0,
      lease_ate BIGINT,
      ultimo_erro TEXT,
      criado_em BIGINT NOT NULL,
      atualizado_em BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS acesso_pedido (
      pedido_id UUID PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expira_em BIGINT NOT NULL,
      revogado_em BIGINT,
      criado_em BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id UUID PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL, telefone TEXT NOT NULL,
      senha_hash TEXT NOT NULL, criado_em BIGINT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
    CREATE TABLE IF NOT EXISTS sessoes_cliente (
      token_hash CHAR(64) PRIMARY KEY, cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      expira_em BIGINT NOT NULL, criado_em BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessoes_cliente_cliente ON sessoes_cliente(cliente_id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS brinde_fidelidade BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id, status);
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cidade TEXT NOT NULL DEFAULT '';
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS rua TEXT NOT NULL DEFAULT '';
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero TEXT NOT NULL DEFAULT '';
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS complemento TEXT NOT NULL DEFAULT '';
    ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS mp_order_id TEXT;
    ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_url TEXT;
    ALTER TABLE produtos ADD COLUMN IF NOT EXISTS imagem_path TEXT;
    ALTER TABLE produtos ADD COLUMN IF NOT EXISTS esgotado BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status, expira_em);
    CREATE INDEX IF NOT EXISTS idx_tentativas_cobranca_retry ON tentativas_cobranca(estado, proxima_tentativa, lease_ate);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pagamentos_mp_order_id ON pagamentos(mp_order_id) WHERE mp_order_id IS NOT NULL;
    DELETE FROM eventos_webhook a USING eventos_webhook b
      WHERE a.request_id=b.request_id AND a.request_id IS NOT NULL AND a.id>b.id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_webhook_request_id ON eventos_webhook(request_id);
    INSERT INTO tentativas_cobranca
      (pedido_id,chave_idempotencia,estado,tentativas,proxima_tentativa,criado_em,atualizado_em)
    SELECT p.id,p.id,'pendente',0,0,p.criado_em,p.criado_em
      FROM pedidos p LEFT JOIN pagamentos pg ON pg.pedido_id=p.id
      WHERE p.status='pendente' AND pg.pedido_id IS NULL
    ON CONFLICT (pedido_id) DO NOTHING;
  `);
  for (const p of produtos) {
    await query(`INSERT INTO produtos (id,nome,descricao,preco_centavos,ativo) VALUES ($1,$2,$3,$4,TRUE)
      ON CONFLICT (id) DO NOTHING`, [p.id, p.nome, p.descricao, p.preco_centavos]);
  }
  // Remove do catálogo o produto padrão descontinuado, sem alterar itens históricos dos pedidos.
  await query("UPDATE produtos SET ativo=FALSE WHERE id='t1'");
}

async function close() { await pool.end(); }

module.exports = { query, withTransaction, init, close };
