import { z } from "zod";
import type { EventStatus } from "@/lib/types/database";

const eventStatusSchema = z.enum([
  "pending_approval",
  "approved",
  "confirmed",
  "assigned",
  "rejected",
]);

export const createEventSchema = z
  .object({
    title: z.string().max(500).optional().default(""),
    description: z.string().max(5000).optional().default(""),
    clientId: z.string().uuid(),
    collaboratorId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    /** Admins only; ignored for collaborators server-side */
    adminOnly: z.boolean().optional().default(false),
    /** Set by server for collaborators; admins may pass */
    status: eventStatusSchema.optional(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt deve ser após startsAt",
    path: ["endsAt"],
  });

export const updateEventSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    clientId: z.string().uuid().optional(),
    collaboratorId: z.string().uuid().nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    status: eventStatusSchema.optional(),
    adminOnly: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.startsAt && d.endsAt) {
        return new Date(d.endsAt) > new Date(d.startsAt);
      }
      return true;
    },
    { message: "endsAt deve ser após startsAt", path: ["endsAt"] },
  );

export const approveAndAssignSchema = z.object({
  eventId: z.string().uuid(),
  collaboratorId: z.string().uuid(),
});

/** Fields collaborators may propose for approval (no status/adminOnly/collaboratorId). */
export const requestEventEditSchema = z
  .object({
    eventId: z.string().uuid(),
    title: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    clientId: z.string().uuid().optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (d) =>
      d.title !== undefined ||
      d.description !== undefined ||
      d.clientId !== undefined ||
      d.startsAt !== undefined ||
      d.endsAt !== undefined,
    { message: "Informe ao menos um campo para alterar.", path: ["eventId"] },
  )
  .refine(
    (d) => {
      if (d.startsAt !== undefined && d.endsAt !== undefined) {
        return new Date(d.endsAt) > new Date(d.startsAt);
      }
      return true;
    },
    { message: "endsAt deve ser após startsAt", path: ["endsAt"] },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RequestEventEditInput = z.infer<typeof requestEventEditSchema>;

export function resolveCreateStatus(
  isAdmin: boolean,
  requested: EventStatus | undefined,
  collaboratorId: string | null,
): EventStatus {
  if (!isAdmin) {
    return "pending_approval";
  }
  if (requested === "assigned" || collaboratorId) {
    return collaboratorId ? "assigned" : (requested ?? "confirmed");
  }
  return requested ?? "confirmed";
}
