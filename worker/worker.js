// The generalized worker. Needs to be run with ramOverride to have enough RAM.
const noop = () => {};

/** @param {NS} ns */
export function main(ns) {
  if (!globalThis?.global?.workerInfo) {
    // Game was reloaded, workers will get rescheduled
    return;
  }
  const info = global.workerInfo.get(ns.args[0]);
  // The worker is completely puppeted by the dispatcher.
  return info.started(ns, info);
}
