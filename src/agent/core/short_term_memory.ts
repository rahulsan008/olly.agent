export type ShortTermMemory = {
  goal: string;
  currentStep: number;
  lastAction: string;
  lastSuccess: boolean;
};

let memory: ShortTermMemory = {
  goal: '',
  currentStep: 0,
  lastAction: '',
  lastSuccess: false
};

export function setGoal(goal: string): void {
  memory.goal = goal;
}

export function setLastAction(lastAction: string): void {
  memory.lastAction = lastAction;
}

export function setLastSuccess(lastSuccess: boolean): void {
  memory.lastSuccess = lastSuccess;
}

export function incrementStep(): void {
  memory.currentStep += 1;
}

export function setCurrentStep(step: number): void {
  memory.currentStep = Math.max(0, step);
}

export function getShortTermMemory(): ShortTermMemory {
  return { ...memory };
}

export function clearShortTermMemory(): void {
  memory = {
    goal: '',
    currentStep: 0,
    lastAction: '',
    lastSuccess: false
  };
}
