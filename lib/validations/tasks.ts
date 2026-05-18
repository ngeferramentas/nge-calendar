import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(500),
  assigneeId: z.string().uuid().optional(),
});

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(2).max(500),
  assigneeId: z.string().uuid().optional(),
});

export const taskIdSchema = z.object({
  taskId: z.string().uuid(),
});
