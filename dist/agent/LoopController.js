export class LoopController {
    decider;
    toolExecutor;
    maxSteps;
    state = 'idle';
    history = [];
    currentStep = 0;
    constructor(decider, toolExecutor, maxSteps = 10) {
        this.decider = decider;
        this.toolExecutor = toolExecutor;
        this.maxSteps = maxSteps;
    }
    async run(intent) {
        const context = {
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
        }
        catch (error) {
            this.state = 'failed';
            return { success: false, finalState: this.state, history: this.history, error: error.message };
        }
    }
    addHistory(step, state, action, observation, thought) {
        const entry = { step, state, action, observation, thought };
        this.history.push(entry);
    }
    logDecision(step, decision) {
        console.log(`[Step ${step}] Decision:`, JSON.stringify(decision, null, 2));
    }
}
