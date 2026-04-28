# Notificações e lembretes

## Tempo real (atribuição)

O cliente assina mudanças em `public.events` via **Supabase Realtime**. Quando um UPDATE define `collaborator_id` igual ao usuário logado, um banner informativo é exibido (sem reload).

Requisito no dashboard Supabase: Realtime habilitado para a tabela `events` (a migração adiciona à publicação).

## QStash (~30 min antes)

1. Variáveis: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`.
2. Ao atribuir/agendar, `scheduleEventReminder` publica uma mensagem com `notBefore` ≈ `starts_at - 30min`.
3. O endpoint [`app/api/webhooks/event-reminder/route.ts`](../app/api/webhooks/event-reminder/route.ts) valida a assinatura **Receiver** do QStash e, se ainda fizer sentido, preenche `reminder_sent_at` (idempotente com `IS NULL`).

Isso dispara outro evento Realtime de UPDATE; o front pode estender o handler para mensagens do tipo “evento em 30 minutos”.

## Cron de fallback (Vercel Hobby)

[`app/api/cron/reminders/route.ts`](../app/api/cron/reminders/route.ts): `GET` com `Authorization: Bearer CRON_SECRET` varre eventos nos **próximos 24h** e marca `reminder_sent_at` quando ainda estiver nulo (idempotente via `IS NULL`).

[`vercel.json`](../vercel.json) está configurado para **1 execução diária** (`0 9 * * *`) para compatibilidade com limites do plano gratuito. Se precisar frequência maior, use outro scheduler externo.

### Teste manual rápido

1. Sem header `Authorization`, `GET /api/cron/reminders` deve retornar `401`.
2. Com `Authorization: Bearer CRON_SECRET`, a rota deve retornar `200` com `{ processed: number }`.
3. `POST /api/webhooks/event-reminder` sem assinatura `upstash-signature` deve retornar `401`.

## Mesmo dia

Alertas imediatos no mesmo dia podem ser cobertos combinando **Realtime** na atribuição com o fluxo QStash; ajuste fino de timezone via `APP_TIMEZONE` / `NEXT_PUBLIC_APP_TIMEZONE`.
