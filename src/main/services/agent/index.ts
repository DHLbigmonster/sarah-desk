/**
 * Agent services module exports.
 */

export { AgentService, agentService } from './agent.service';
export { ContextCaptureService, contextCaptureService } from './context-capture.service';
export { MemoryService, memoryService, MEMORY_DIR, MEMORY_FILE } from './memory.service';
export type { AgentMemory } from './memory.service';
export { ConsolidationService, consolidationService } from './consolidation.service';
export { DictationRefinementService, dictationRefinementService } from './dictation-refinement.service';
export { DictionaryService, dictionaryService } from './dictionary.service';
export {
  LightweightRefinementClient,
  lightweightRefinementClient,
  loadLightweightRefinementConfig,
} from './lightweight-refinement-client';
