# Eventos, validação e auditoria

## Server Actions

Implementação principal: [`app/actions/events.ts`](../app/actions/events.ts).

| Action | Quem | Notas |
|--------|------|--------|
| `createEvent` | Admin ou colaborador | Colaborador: `pending_approval`, sem colaborador. Admin: pode criar já `assigned` com colaborador. |
| `updateEvent` | Só admin | Sobreposição de horário recalculada; auditoria com snapshot. |
| `approveAndAssignEvent` | Admin | Pendente → `assigned`; define `approved_by`, `approved_at`, `assigned_at`. |
| `rejectEvent` | Admin | `status = rejected`. |
| `listEventsForUser` | Autenticado | Admin: todos ou filtro por colaborador; colaborador: atribuídos + pendentes próprios. |

DTOs Zod: [`lib/validations/events.ts`](../lib/validations/events.ts).

## Sobreposição de horário

Lógica em [`lib/events/overlap.ts`](../lib/events/overlap.ts):

- Intervalo `[start, end)` colide com outro se `start1 < end2` e `end1 > start2`.
- **Sem colaborador** (ex.: pendente novo): conflita com eventos em `approved`, `confirmed`, `assigned`.
- **Com colaborador**: conflita com eventos **do mesmo colaborador** (exceto `rejected`).

## Auditoria

[`lib/audit.ts`](../lib/audit.ts) chama a RPC `append_audit_log` para registrar `entity_type`, `entity_id`, `action` e `metadata`.

## Lembrete agendado

Após criar/atribuir com colaborador, [`lib/reminders/qstash.ts`](../lib/reminders/qstash.ts) agenda entrega HTTP via QStash para ~30 minutos antes do início (se `QSTASH_TOKEN` estiver definido).
