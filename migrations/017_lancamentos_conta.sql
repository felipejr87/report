-- =============================================
-- JARVIS — Migration 017 · Conta corrente / cartão de crédito
-- Financeiro passa a ser organizado por conta (como um extrato real),
-- não por categoria — categoria vira só um resumo depois.
-- =============================================

alter table lancamentos add column conta text not null default 'corrente'
  check (conta in ('corrente', 'cartao'));

-- Backfill: lançamentos já feitos com meio='cartao' são fatura de cartão.
update lancamentos set conta = 'cartao' where meio = 'cartao';
