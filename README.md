# Report

Substitui a planilha paralela que todo PO/analista mantém ao lado do Jira. Responde
"onde está cada demanda e qual o próximo passo?" em 10 segundos, para qualquer pessoa
com o código do espaço.

Acesso por **código de espaço + senha** — sem cadastro individual.

## Stack

- Frontend: React + Vite + PWA
- Backend: Supabase (Postgres + RLS + Edge Functions Deno)

## Setup local

### 1. Clonar e instalar

```bash
git clone https://github.com/felipejr87/report.git
cd report
npm install
```

> Requer Node ≥ 20.0.0. `@supabase/supabase-js` está fixado em `2.109.0` (última
> versão compatível com Node 20 — a partir de `2.110.0` a lib passa a exigir Node ≥ 22).

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com os dados do projeto Supabase
(Project Settings → API):

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

### 3. Banco de dados

No SQL Editor do dashboard Supabase, executar o conteúdo de
[`migrations/001_schema_inicial.sql`](migrations/001_schema_inicial.sql). Isso cria as
tabelas (`espacos`, `demandas`, `movimentos`, `poker_sessoes`, `poker_votos`) e todas as
políticas de RLS.

### 4. Edge Functions

Requer o [Supabase CLI](https://supabase.com/docs/guides/cli) instalado.

```bash
npx supabase login
npx supabase functions deploy entrar-espaco --project-ref <REF_DO_PROJETO>
npx supabase functions deploy criar-espaco  --project-ref <REF_DO_PROJETO>
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente. **`SUPABASE_JWT_SECRET`
não é** em projetos novos (o nome é reservado, então não dá pra defini-lo manualmente com esse
nome). É preciso configurar um secret próprio chamado `JWT_SIGNING_SECRET` com o valor de
**Project Settings → API → JWT Settings → Legacy JWT Secret**:

```bash
npx supabase secrets set JWT_SIGNING_SECRET=<valor_do_legacy_jwt_secret> --project-ref <REF_DO_PROJETO>
```

Ou pelo dashboard: Edge Functions → Secrets → adicionar `JWT_SIGNING_SECRET`. Sem isso,
`entrar-espaco` responde 500 no login (a função tenta `SUPABASE_JWT_SECRET` primeiro, cai para
`JWT_SIGNING_SECRET`, e retorna erro genérico se nenhum dos dois existir — nunca falha
silenciosamente com uma chave vazia).

### 5. Rodar

```bash
npm run dev
```

Abre em `http://localhost:5173`.

### 6. Deploy (Vercel)

Não configurado nesta sessão. Para conectar depois: importar o repo no dashboard da
Vercel (conta `felipejr1`), framework preset "Vite", e definir `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do projeto Vercel.

## Estrutura

```
report/
├── public/manifest.json, icons/
├── src/
│   ├── lib/supabase.js        ← cliente Supabase (base + autenticado por token)
│   ├── hooks/useAuth.jsx      ← contexto de sessão do espaço (localStorage)
│   ├── pages/Entrada.jsx      ← criar/entrar em espaço
│   ├── pages/Espaco.jsx       ← lista de demandas + filtros + CRUD
│   └── components/            ← CardDemanda, FormDemanda, BadgeParado
├── supabase/functions/        ← entrar-espaco, criar-espaco (Edge Functions)
└── migrations/001_schema_inicial.sql
```

> Nota: `useAuth` é `.jsx` (não `.js`) porque contém JSX — Rollup não compila JSX em
> arquivos `.js`.

## Modelo de segurança (não alterar sem validar)

- RLS fecha tudo por padrão; toda política filtra por
  `espaco_id = (auth.jwt() ->> 'espaco_id')::uuid`.
- O JWT de sessão é emitido pela Edge Function `entrar-espaco` e assinado com
  `SUPABASE_JWT_SECRET` — a única chave que o RLS do Supabase aceita para ler
  `auth.jwt()`. Não trocar por outra chave.
- Senha de espaço: hash bcrypt (`npm:bcryptjs`, custo 12). Nunca fica em texto puro,
  nunca é logada, nunca é persistida no cliente.
- `entrar-espaco` tem rate limit de 5 tentativas/min por IP e retorna mensagem
  genérica ("Código ou senha incorretos.") tanto para código inexistente quanto senha
  errada, para não vazar quais códigos existem.

## Escopo da Sessão 1

Implementado: setup do projeto, schema + RLS, Edge Functions `entrar-espaco` e
`criar-espaco`, tela de entrada (criar/entrar em espaço), tela de espaço (lista +
filtro por fase), CRUD de demandas, registro de `movimentos` (criação, edição,
mudança de fase), badge de "sem movimento há Xd".

Fora de escopo (S2+): planning poker em tempo real, gerador de status report,
planos pagos, landing page.

## Pendências para Felipe validar antes da S2

- [ ] Reautorizar o conector Supabase (MCP) para a conta `felipejr1` — no momento só
      há acesso à conta `cortai.contato@gmail.com` (org "Cortai"), então o projeto
      Supabase do Report ainda não foi criado nem a migration/Edge Functions foram
      deployadas.
- [ ] Criar o repositório privado `felipejr87/report` no GitHub (vazio) para receber o
      primeiro push.
- [ ] Conectar o repo à Vercel (conta `felipejr1`) — deixado para depois, não bloqueia
      a Sessão 1.
- [ ] Depois que o projeto Supabase existir: rodar a migration, deployar as duas Edge
      Functions e preencher `.env.local` com as chaves reais.
- [ ] Rodar o smoke test completo (seção 12 do prompt da Sessão 1) contra o projeto
      Supabase real e reportar evidência.
- [ ] Substituir os ícones PWA gerados como placeholder (`public/icons/`) por
      ícones de marca reais.
