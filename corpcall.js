// Dynamic dispatch for functions that cost less than 20GB.
// The limit is set by using ramOverride.

// All calls become async, but in the common case execution
// will return immediately to your script after the stub call is finished,
// without other scripts having a chance to interfere.

// Usage (note the use of corp["functionName"] to avoid
// the static RAM cost in the main controller script):
//
// import { corpProxy } from "corpcall.js";
// const corp = corpProxy(ns);
// await corp["throwParty"](divison, "Aevum", 420000);
// const office = await corp["getOffice"](divison, "Aevum");

/**
 * @param {NS} ns
 * @returns A proxy that uses RAM-dodging for all corp calls
 */
export function corpProxy(ns) {
  // Credit to DarkTechnomancer for the Proxy idea/impl
  return new Proxy(ns.corporation, {
    get(_, functionName) {
      return (...args) => {
        return stubCall(ns, ns2 => ns2.corporation[functionName](...args));
      };
    },
  });
}

// This takes a function as an argument, which will be executed in a "stub"
// script for RAM-saving reasons. The first argument to the function is
// the `ns` instance.
// **It is very important** that you use this argument to execute your calls,
// otherwise you will achieve no ram saving!

/**
 * @callback stubCallback
 * @param {NS} ns
 * @returns {*}
 */

/**
 * Dynamic dispatch for functions that cost less than 20GB.
 * @param {NS} ns
 * @param {stubCallback} func
 */
export async function stubCall(ns, func) {
  globalThis.corpcall ??= {};
  const stub = "corpcall.js";

  if (corpcall.stubRunning) {
    // Protect against multiple concurrent execution.
    // The "real" awaiter is below.
    await corpcall.stubRunning;
    if (corpcall.stubRunning) {
      // The Promise should have cleaned up this variable.
      throw new Error("stubcall error after queueing");
    }
  }

  // This could be changed to use exec() too.
  const pid = ns.run(stub, {ramOverride: 20});

  if (pid === 0) {
    throw new Error("Failed to run " + stub);
  }

  const stubcall_watchdog = setTimeout(
    () => corpcall.stubcall_reject("Stubcall timed out!"),
    10000
  );
  const promise = new Promise((resolve, reject) => {
    corpcall.stubcall_cb = resolve;
    corpcall.stubcall_reject = reject;
  }).finally(() => {
    corpcall.stubcall_func = null;
    corpcall.stubRunning = null;
    clearTimeout(stubcall_watchdog);
  });
  corpcall.stubcall_func = func;
  corpcall.stubRunning = promise;

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

/** @param {NS} ns */
function stubBody(ns) {
  ns.disableLog("ALL");
  if (!globalThis?.corpcall?.stubcall_reject) {
    // Can happen on game restart, don't throw error dialogs.
    return;
  }
  const func = corpcall.stubcall_func;
  try {
    if (!func) {
      throw new SyntaxError("Stubcall failure");
    }
    const result = func(ns);
    // We don't just use await, because we want to synchronously
    // return for non-async functions.
    if (result?.then) {
      result.then(corpcall.stubcall_cb, corpcall.stubcall_reject);
      return result;
    } else {
      corpcall.stubcall_cb(result);
    }
  } catch (err) {
    corpcall.stubcall_reject(err);
  }
}

/** @param {NS} ns */
export function main(ns) {
  return stubBody(ns);
}
