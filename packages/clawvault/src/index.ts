export { vault, ClawVault } from './vault.js';
export type { VaultEntry } from './vault.js';
export { keychain } from './keychain.js';
export { autoDetectAndStoreKeys, migrateConfigToVaultRefs } from './migrator.js';
export type { DetectionResult } from './migrator.js';
export { resolveVaultRefs, detectRawKeys } from './injector.js';
