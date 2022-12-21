/** @param {NS} ns */
export async function stubCall(ns, func, ...args) {
  globalThis.global ??= {};
  let stub = "lib/stub.js";
  if (Object.hasOwn(ns, "ns")) {
    stub = ns.stub ?? stub;
    ns = ns.ns;
  }
  if (typeof func !== "function") {
    // Do error-checking ahead of time
    const method = func;
    if (!ns[method]) {
      throw new Error("Invalid method in stubCall: " + method);
    }
    // Not async, because if method is async it'll return a Promise
    // that gets awaited directly.
    func = (ns_) => ns_[method](...args);
  }

  if (global.stubRunning) {
    // Protect against multiple concurrent execution.
    // The "real" awaiter is below.
    await global.stubRunning;
    if (global.stubRunning) {
      // The Promise should have cleaned up this variable.
      throw new Error("stubcall error after queueing");
    }
  }

  // exec is used to avoid paying for run()
  const oldState = ns.isLogEnabled("exec");
  ns.disableLog("exec");
  const pid = ns.exec(stub, "home");
  if (oldState) ns.enableLog("exec");

  if (pid === 0) {
    throw new Error("Failed to exec " + stub);
  }

  const stubcall_watchdog = setTimeout(
    () => global.stubcall_reject("Stubcall timed out!"),
    10000
  );
  const promise = new Promise((resolve, reject) => {
    global.stubcall_cb = resolve;
    global.stubcall_reject = reject;
  }).finally(() => {
    global.stubcall_func = null;
    global.stubRunning = null;
    clearTimeout(stubcall_watchdog);
  });
  global.stubcall_func = func;
  global.stubRunning = promise;

  let result;
  try {
    // Extra promise at the end delays execution for a microtask tick,
    // giving the game time to clean up the stub script.
    result = await promise;
  } catch (err) {
    if (err instanceof Error || Object.hasOwn(err, "pid")) {
      throw err;
    }
    // Wrap to gain stack trace
    throw new Error(err);
  }
  return result;
}
