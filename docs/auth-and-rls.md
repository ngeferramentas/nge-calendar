# Autenticação e RLS

## Sessão Supabase (JWT)

Não há JWT custom: a sessão é a do **Supabase Auth** (JWT nas cookies HTTP, renovado no middleware).

- Cliente browser: [`lib/supabase/client.ts`](../lib/supabase/client.ts)
- Server Components / Actions: [`lib/supabase/server.ts`](../lib/supabase/server.ts)
- Operações privilegiadas (cron, webhook, `auth.admin`): [`lib/supabase/service.ts`](../lib/supabase/service.ts) com **service role apenas no servidor**

## Papéis

- **admin**: vê todos os eventos (com filtro opcional por colaborador), edita eventos, CRUD de clientes, pode acessar `/equipe` se `can_manage_users`.
- **collaborator**: vê eventos atribuídos a si e pendentes que criou; **não** atualiza eventos via RLS; cria eventos apenas `pending_approval` sem colaborador.

## Políticas RLS (resumo)

- **profiles**: leitura para si ou admin; atualização para si ou admin.
- **clients**: leitura para qualquer usuário autenticado (busca na criação de evento); escrita só admin.
- **events**: insert conforme papel; **update/delete só admin**; select conforme regra de visão (admin / colaborador).
- **audit_logs**: select admin; insert autenticado com `actor_id = auth.uid()` ou via função `SECURITY DEFINER`.

Função auxiliar SQL: `is_admin()`.

## Middleware

Sem `NEXT_PUBLIC_SUPABASE_*`, o middleware apenas repassa a requisição (útil para build local sem `.env`). Com variáveis definidas, a sessão é atualizada e rotas protegidas redirecionam para `/`.
