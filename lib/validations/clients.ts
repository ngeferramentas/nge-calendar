import { z } from "zod";

export const clientUpsertSchema = z.object({
  documentType: z.enum(["cpf", "cnpj"]),
  documentNumber: z.string().min(11).max(18),
  fullName: z.string().min(2).max(300),
  email: z.string().email().or(z.literal("")),
  phone: z.string().max(40).optional().default(""),
  addressLine: z.string().max(500).optional().default(""),
  bairro: z.string().max(200).optional().default(""),
  city: z.string().max(120).optional().default(""),
  state: z.string().max(120).optional().default(""),
  postalCode: z.string().max(20).optional().default(""),
  isActive: z.boolean().optional().default(true),
});

export function normalizeDocument(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const searchClientsSchema = z.object({
  query: z.string().min(1).max(100),
});
