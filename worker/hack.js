// The hack worker. Also servers as a template for the other workers.
const noop = () => {};

/** @param {NS} ns */
export async function mainLoop(ns, workerFunc) {
  // workerFunc is actually ignored, it is used only for the
  // static RAM cost.
  if (!globalThis?.global?.workerInfo) {
    // Game was reloaded, workers will get rescheduled
    return;
  }
  const info = global.workerInfo.get(ns.args[0]);
  // The worker is completely puppeted by the dispatcher.
  return info.started(ns, info);
}

/** @param {NS} ns */
export function main(ns) {
  return mainLoop(ns, ns.hack);
}
