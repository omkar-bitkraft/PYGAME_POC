const state = {
  activeRunId: null,
  runtimeState: "idle"
};

export function getRuntimeState() {
  return { ...state };
}

export function setRuntimeState(nextState) {
  if (nextState.activeRunId !== undefined) {
    state.activeRunId = nextState.activeRunId;
  }

  if (nextState.runtimeState !== undefined) {
    state.runtimeState = nextState.runtimeState;
  }

  return getRuntimeState();
}
