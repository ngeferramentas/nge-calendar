# Schema do banco (Supabase / PostgreSQL)

A migração inicial está em [`supabase/migrations/00001_initial_schema.sql`](../supabase/migrations/00001_initial_schema.sql). Execute no SQL Editor do Supabase ou via CLI.

## Tabelas

| Tabela        | Função |
|---------------|--------|
| `profiles`    | 1:1 com `auth.users`: nome, `role` (`admin` \| `collaborator`), `can_manage_users`. |
| `clients`     | Clientes (CPF/CNPJ normalizado, contato, endereço). |
| `events`      | Eventos com FKs `client_id`, `collaborator_id`, `created_by`, `status`, janela `starts_at`/`ends_at`, aprovação e `reminder_sent_at`. |
| `audit_logs`  | Auditoria via RPC `append_audit_log` (actor = `auth.uid()`). |

## Trigger de signup

`handle_new_user` em `auth.users`: cria `profiles`; se não existir nenhum perfil ainda, o primeiro usuário vira **admin** com `can_manage_users = true`.

## Realtime

A publicação `supabase_realtime` inclui `public.events` para assinaturas no browser.

## Tipos TypeScript

Tipos de domínio em [`lib/types/database.ts`](../lib/types/database.ts). Para tipos gerados automaticamente, use `supabase gen types typescript` apontando para o seu projeto.
