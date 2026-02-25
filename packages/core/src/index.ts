// ClawSentinel Core — public API
// All shared infrastructure used across packages

export { eventBus } from './event-bus.js';
export { logger, moduleLogger } from './logger.js';
export { config } from './config.js';
export { getDb, closeDb, db } from './db/client.js';
export { applySchema } from './db/schema.js';

export type {
  ClawSentinelEvent,
  PartialEvent,
  EventSeverity,
  EventSource,
  EventCategory
} from './types/events.js';

export type {
  ClawSentinelConfig
} from './types/config.js';

export type {
  ModuleName,
  ModuleStatus,
  ModuleHealth,
  SystemHealth
} from './types/modules.js';

export { ClawSentinelConfigSchema } from './types/config.js';
export { ClawSentinelEventSchema } from './types/events.js';

export { readPlan, writePlan, isPro, hoursUntilExpiry, getMachineId } from './plan.js';
export type { PlanData } from './plan.js';
