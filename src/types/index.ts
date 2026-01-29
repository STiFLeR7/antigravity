export type AgentState = 'idle' | 'planning' | 'acting' | 'observing' | 'reflecting' | 'completed' | 'failed';

export interface Action {
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;
}

export interface Observation {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

export interface HistoryEntry {
  step: number;
  state: AgentState;
  action?: Action;
  observation?: Observation;
  thought?: string;
}

export interface AgentContext {
  intent: string;
  history: HistoryEntry[];
  maxSteps: number;
  currentStep: number;
  metadata: Record<string, any>;
}

export interface LoopResult {
  success: boolean;
  finalState: AgentState;
  history: HistoryEntry[];
  error?: string;
}
