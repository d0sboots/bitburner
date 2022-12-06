// The hack worker. Also servers as a template for the other workers.

/** @param {NS} ns */
export async function mainLoop(ns, workerFunc) {
  if (!globalThis?.global?.workerInfo) {
    // Game was reloaded, workers will get rescheduled
    return;
  }
  const info = global.workerInfo[ns.args[0]];
  const bound = workerFunc.bind(ns);
  info.startTime = performance.now();
  let promise;
  try {
    promise = bound(info.target, info.opts);
  } catch (err) {
    info.reject(err);
  }
  // On the side, notify our parent.
  promise.then(
    (value) => {
      info.endTime = performance.now();
      info.resolve(value);
    },
    (err) => info.reject(err)
  );
  return promise;
}

/** @param {NS} ns */
export function main(ns) {
  return mainLoop(ns, ns.hack);
}
