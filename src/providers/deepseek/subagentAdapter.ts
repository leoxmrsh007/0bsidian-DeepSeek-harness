import type { ProviderManagedSubagentAdapter } from '../../core/providers/types';
import { TOOL_AGENT_OUTPUT } from '../../core/tools/toolNames';
import { isDeepSeekSubagentToolName } from './subagentToolNames';

export const deepseekSubagentAdapter: ProviderManagedSubagentAdapter = {
  protocol: 'managed-agent',
  isOutputTool(name) {
    return name === TOOL_AGENT_OUTPUT;
  },
  isSpawnTool(name) {
    return isDeepSeekSubagentToolName(name);
  },
};
