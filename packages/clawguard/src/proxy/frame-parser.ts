// OpenClaw WebSocket frame parser
// Identifies message type and content source so the taint tracker
// can classify external vs internal content before inspection.

export type FrameType =
  | 'user_message'        // Human turn — may contain injected external content
  | 'tool_result'         // Tool output — HIGH RISK: from external web/file/memory
  | 'tool_call'           // Agent calling a tool — inspect for abuse
  | 'assistant_message'   // Claude response — lower risk outbound
  | 'system_prompt'       // System configuration — should be internal only
  | 'memory_read'         // Memory retrieval — medium risk
  | 'memory_write'        // Memory persistence — HIGH RISK: persistence attack vector
  | 'unknown';            // Unparseable — treat as untrusted

export type ContentSource =
  | 'user'            // Direct user input — trusted
  | 'web'             // Fetched from internet — untrusted
  | 'file'            // Read from filesystem
  | 'memory'          // Agent memory — potentially tampered
  | 'tool'            // Generic tool output
  | 'internal'        // Agent's own reasoning — trusted
  | 'unknown';        // Cannot determine — treat as untrusted

export interface ParsedFrame {
  type: FrameType;
  source: ContentSource;
  content: string;
  toolName?: string;
  sessionId?: string;
  raw: string;
}

// Parse an OpenClaw WebSocket message into a structured frame
// OpenClaw uses JSON messages with a `type` field following Claude's API shape
export function parseFrame(raw: string): ParsedFrame {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Not JSON — treat as raw text, unknown source
    return {
      type: 'unknown',
      source: 'unknown',
      content: raw,
      raw
    };
  }

  const msgType = String(parsed['type'] ?? '');
  const role = String(parsed['role'] ?? '');

  // ── Claude API message format ─────────────────────────────────────────────
  if (role === 'user') {
    return {
      type: 'user_message',
      source: 'user',
      content: extractTextContent(parsed['content']),
      sessionId: parsed['session_id'] as string | undefined,
      raw
    };
  }

  if (role === 'assistant') {
    return {
      type: 'assistant_message',
      source: 'internal',
      content: extractTextContent(parsed['content']),
      raw
    };
  }

  // ── Tool result (external content entering the context window) ────────────
  if (msgType === 'tool_result' || role === 'tool') {
    const toolName = String(parsed['tool_use_id'] ?? parsed['name'] ?? '');
    const source = classifyToolSource(toolName, parsed);
    return {
      type: 'tool_result',
      source,
      content: extractTextContent(parsed['content']),
      toolName,
      raw
    };
  }

  // ── Tool call (agent invoking a tool) ─────────────────────────────────────
  if (msgType === 'tool_use' || msgType === 'tool_call') {
    const toolName = String(parsed['name'] ?? '');
    return {
      type: 'tool_call',
      source: 'internal',
      content: JSON.stringify(parsed['input'] ?? parsed['arguments'] ?? {}),
      toolName,
      raw
    };
  }

  // ── Memory operations ─────────────────────────────────────────────────────
  if (msgType === 'memory_write' || msgType === 'memory_store') {
    return {
      type: 'memory_write',
      source: 'internal',
      content: extractTextContent(parsed['content'] ?? parsed['value']),
      raw
    };
  }

  if (msgType === 'memory_read' || msgType === 'memory_retrieve') {
    return {
      type: 'memory_read',
      source: 'memory',
      content: extractTextContent(parsed['content'] ?? parsed['value']),
      raw
    };
  }

  // ── System prompt ─────────────────────────────────────────────────────────
  if (role === 'system' || msgType === 'system') {
    return {
      type: 'system_prompt',
      source: 'internal',
      content: extractTextContent(parsed['content']),
      raw
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    type: 'unknown',
    source: 'unknown',
    content: raw,
    raw
  };
}

// Classify the source of a tool result based on tool name
function classifyToolSource(
  toolName: string,
  _frame: Record<string, unknown>
): ContentSource {
  const name = toolName.toLowerCase();

  if (name.includes('web') || name.includes('browser') || name.includes('fetch') || name.includes('search') || name.includes('url')) {
    return 'web';
  }
  if (name.includes('read_file') || name.includes('file_read') || name.includes('fs') || name.includes('filesystem')) {
    return 'file';
  }
  if (name.includes('memory') || name.includes('remember')) {
    return 'memory';
  }

  return 'tool';
}

// Extract text content from various Claude API content shapes
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b['type'] === 'text' && typeof b['text'] === 'string') return b['text'];
          if (typeof b['text'] === 'string') return b['text'];
        }
        return String(block);
      })
      .join('\n');
  }
  if (typeof content === 'object' && content !== null) {
    const c = content as Record<string, unknown>;
    if (typeof c['text'] === 'string') return c['text'];
    return JSON.stringify(content);
  }
  return String(content ?? '');
}
