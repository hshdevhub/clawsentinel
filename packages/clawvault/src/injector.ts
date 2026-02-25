import { vault } from './vault.js';
import { moduleLogger } from '@clawsentinel/core';

const log = moduleLogger('clawvault:injector');

// Pattern that matches vault references in any string value
// e.g., "Authorization: Bearer @vault:anthropic"
const VAULT_REF_PATTERN = /@vault:[a-zA-Z0-9_-]+/g;

// Resolve all vault references in an HTTP request payload before forwarding
// Used by ClawGuard to inject credentials into outbound API calls
export function resolveVaultRefs(
  payload: string,
  targetEndpoint: string
): { resolved: string; count: number } {
  let count = 0;

  const resolved = payload.replace(VAULT_REF_PATTERN, (match: string) => {
    const value = vault.resolve(match, targetEndpoint);
    if (value && value !== match) {
      count++;
      return value;
    }
    // Vault denied or not found — return the reference as-is (will cause auth failure naturally)
    log.warn(`Vault ref could not be resolved`, { ref: match, targetEndpoint });
    return match;
  });

  return { resolved, count };
}

// Check if an outbound request contains raw API keys (not vault refs)
// Signals that a key may have leaked into the agent context
export function detectRawKeys(payload: string): string[] {
  const patterns = [
    /sk-ant-[a-zA-Z0-9-]{20,}/g,   // Anthropic
    /sk-[a-zA-Z0-9]{48}/g,          // OpenAI
    /AIza[a-zA-Z0-9-_]{35}/g        // Google/Gemini
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = payload.match(pattern);
    if (matches) {
      found.push(...matches.map(m => m.slice(0, 10) + '***')); // Truncate for logging safety
    }
  }

  return found;
}
