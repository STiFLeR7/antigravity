import { AgentContext, LoopResult, AgentState, HistoryEntry, Action, Observation } from '../types/index.js';

export interface Decider {
  decide(context: AgentContext): Promise<{ action?: Action; thought: string; terminal?: boolean }>;
}

export interface ToolExecutor {
  execute(action: Action): Promise<Observation>;
}

export class LoopController {
  private state: AgentState = 'idle';
  private history: HistoryEntry[] = [];
  private currentStep = 0;

  constructor(
    private decider: Decider,
    private toolExecutor: ToolExecutor,
    private maxSteps: number = 10
  ) {}

  async run(intent: string): Promise<LoopResult> {
    const context: AgentContext = {
      intent,
      history: this.history,
      maxSteps: this.maxSteps,
      currentStep: this.currentStep,
      metadata: {}
    };

    try {
      while (this.currentStep < this.maxSteps) {
        this.currentStep++;
        
        // 1. Plan / Decide
        this.state = 'planning';
        const decision = await this.decider.decide({ ...context, currentStep: this.currentStep, history: this.history });
        
        this.logDecision(this.currentStep, decision);

        if (decision.terminal) {
          this.state = 'completed';
          this.addHistory(this.currentStep, this.state, undefined, undefined, decision.thought);
          break;
        }

        if (!decision.action) {
          this.state = 'reflecting';
          this.addHistory(this.currentStep, this.state, undefined, undefined, decision.thought);
          continue;
        }

        // 2. Act
        this.state = 'acting';
        const action = decision.action;
        
        // 3. Observe
        this.state = 'observing';
        const observation = await this.toolExecutor.execute(action);
        
        // 4. Reflect
        this.state = 'reflecting';
        this.addHistory(this.currentStep, this.state, action, observation, decision.thought);

        if (this.currentStep >= this.maxSteps) {
          this.state = 'failed';
          return { success: false, finalState: this.state, history: this.history, error: 'Max steps reached' };
        }
      }

      return { success: this.state === 'completed', finalState: this.state, history: this.history };
    } catch (error: any) {
      this.state = 'failed';
      return { success: false, finalState: this.state, history: this.history, error: error.message };
    }
  }

  private addHistory(step: number, state: AgentState, action?: Action, observation?: Observation, thought?: string) {
    const entry: HistoryEntry = { step, state, action, observation, thought };
    this.history.push(entry);
  }

  private logDecision(step: number, decision: any) {
    console.log(`[Step ${step}] Decision:`, JSON.stringify(decision, null, 2));
  }
}
