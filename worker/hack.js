// The hack worker. Also servers as a template for the other workers.

/** @param {NS} ns */
export async function mainLoop(ns, workerFunc) {
  if (!globalThis?.global?.workerInfo) {
    // Game was reloaded, workers will get rescheduled
    return;
  }
  const info = global.workerInfo[ns.args[0]];
  try {
    const bound = workerFunc.bind(ns);
    info.startTime = performance.now();
    const promise = bound(info.target, info.opts);
    // On the side, notify our parent.
    promise.then(
      (value) => {
        info.endTime = performance.now();
        info.resolve(value);
      },
      (err) => info.reject(err)
    );
    return promise;
  } catch (err) {
    // This can lead to double error messages, but it's better
    // than missing them.
    info.reject(err);
    throw err;
  }
}

/** @param {NS} ns */
export function main(ns) {
  return mainLoop(ns, ns.hack);
}
