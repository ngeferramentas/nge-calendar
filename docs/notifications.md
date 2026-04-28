# Notificações e lembretes

## Tempo real (atribuição)

O cliente assina mudanças em `public.events` via **Supabase Realtime**. Quando um UPDATE define `collaborator_id` igual ao usuário logado, um banner informativo é exibido (sem reload).

Requisito no dashboard Supabase: Realtime habilitado para a tabela `events` (a migração adiciona à publicação).

## QStash (~30 min antes)

1. Variáveis: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`.
2. Ao atribuir/agendar, `scheduleEventReminder` publica uma mensagem com `notBefore` ≈ `starts_at - 30min`.
3. O endpoint [`app/api/webhooks/event-reminder/route.ts`](../app/api/webhooks/event-reminder/route.ts) valida a assinatura **Receiver** do QStash e, se ainda fizer sentido, preenche `reminder_sent_at` (idempotente com `IS NULL`).

Isso dispara outro evento Realtime de UPDATE; o front pode estender o handler para mensagens do tipo “evento em 30 minutos”.

## Cron de fallback

[`app/api/cron/reminders/route.ts`](../app/api/cron/reminders/route.ts): `GET` com `Authorization: Bearer CRON_SECRET` marca lembretes para eventos entre ~29 e ~31 minutos no futuro, se `reminder_sent_at` ainda for nulo.

[`vercel.json`](../vercel.json) inclui exemplo de cron por minuto na Vercel; ajuste conforme o provedor (outros hosts podem usar scheduler externo).

## Mesmo dia

Alertas imediatos no mesmo dia podem ser cobertos combinando **Realtime** na atribuição com o fluxo QStash; ajuste fino de timezone via `APP_TIMEZONE` / `NEXT_PUBLIC_APP_TIMEZONE`.
