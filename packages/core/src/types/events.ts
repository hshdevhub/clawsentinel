import { z } from 'zod';

export const EventSeveritySchema = z.enum(['info', 'warn', 'block', 'critical']);
export const EventSourceSchema = z.enum(['clawguard', 'clawhub', 'clawvault', 'clawbox', 'system']);
export const EventCategorySchema = z.enum([
  'injection',
  'supply_chain',
  'credential',
  'tool_abuse',
  'infrastructure',
  'correlation',
  'system'
]);

export type EventSeverity = z.infer<typeof EventSeveritySchema>;
export type EventSource = z.infer<typeof EventSourceSchema>;
export type EventCategory = z.infer<typeof EventCategorySchema>;

export const ClawSentinelEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: EventSourceSchema,
  severity: EventSeveritySchema,
  category: EventCategorySchema,
  description: z.string().min(1).max(500),
  sessionId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export type ClawSentinelEvent = z.infer<typeof ClawSentinelEventSchema>;

export type PartialEvent = Omit<ClawSentinelEvent, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: string;
};
