import { z } from 'zod';

export const ClawSentinelConfigSchema = z.object({
  version: z.string().default('0.1.0'),

  proxy: z.object({
    listenPort: z.number().int().min(1024).max(65535).default(18790),
    upstreamPort: z.number().int().min(1024).max(65535).default(18789),
    upstreamHost: z.string().default('127.0.0.1')
  }).default({}),

  modules: z.object({
    clawguard: z.boolean().default(true),
    clawvault: z.boolean().default(true),
    clawhubScanner: z.boolean().default(true),
    clawbox: z.boolean().default(false),
    claweye: z.boolean().default(true)
  }).default({}),

  semanticEngine: z.object({
    enabled: z.boolean().default(true),
    scoreThreshold: z.number().min(0).max(100).default(30),
    ollama: z.object({
      enabled: z.boolean().default(false),
      host: z.string().default('http://localhost:11434'),
      model: z.string().default('mistral')
    }).default({})
  }).default({}),

  clawguard: z.object({
    blockThreshold: z.number().min(0).max(100).default(71),
    warnThreshold: z.number().min(0).max(100).default(31),
    maxLatencyMs: z.number().default(50)
  }).default({}),

  clawhubScanner: z.object({
    passThreshold: z.number().min(0).max(100).default(60),
    blockOnFailure: z.boolean().default(true),
    allowUnverified: z.boolean().default(false)
  }).default({}),

  claweye: z.object({
    port: z.number().int().min(1024).max(65535).default(7432),
    correlationWindowMs: z.number().default(1800000)
  }).default({}),

  alerts: z.object({
    desktop: z.boolean().default(true),
    telegram: z.object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
      chatId: z.string().optional()
    }).default({})
  }).default({})
});

export type ClawSentinelConfig = z.infer<typeof ClawSentinelConfigSchema>;
