# Agenda Schedule-X

## Componente

[`components/schedule-calendar.tsx`](../components/schedule-calendar.tsx) é um **Client Component** que:

- importa `temporal-polyfill/global` (peer do `@schedule-x/calendar`);
- usa **`useNextCalendarApp`** de `@schedule-x/react` (compatível com Next.js / SSR);
- registra views **semana** e **dia** (`viewWeek`, `viewDay`);
- aplica tema default: `@schedule-x/theme-default/dist/index.css`.

## Cores (paleta Google)

Mapeadas por `status` do evento em `calendarId`:

| Status | Cor principal |
|--------|-----------------|
| `pending_approval` | `#F4B400` |
| `approved` / `confirmed` | `#4285F4` |
| `assigned` | `#0F9D58` |
| `rejected` | `#DB4437` |

Colaboradores usam `readonly: true` nas entradas de `calendars` para reduzir edição in-place; admins podem arrastar/redimensionar e o `updateEvent` persiste no servidor.

## Dados

Eventos vêm de `listEventsForUser` com join `clients(full_name, document_normalized)` para títulos legíveis. Atualizações em lote usam `calendarApp.events.set(...)` após mudar o estado React.

## UX admin

Clique em evento **pendente** abre modal **Aprovar e atribuir** / **Rejeitar**. Criação usa modal com **ClientCombobox** (busca server action `searchClients`).
