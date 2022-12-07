// The hack worker. Also servers as a template for the other workers.
const noop = () => {};

/** @param {NS} ns */
export async function mainLoop(ns, workerFunc) {
  if (!globalThis?.global?.workerInfo) {
    // Game was reloaded, workers will get rescheduled
    return;
  }
  const id = ns.args[0];
  const info = global.workerInfo[id];
  try {
    const bound = workerFunc.bind(ns);
    info.startTime = performance.now();
    const promise = bound(info.target, info.opts);
    // On the side, notify our parent.
    // The extra noop in the promise chain gives the script time
    // to exit before the promise resolves in dispatch.js.
    promise.finally(noop).then(
      (value) => {
        info.endTime = performance.now();
        info.resolve([info, id, value]);
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
