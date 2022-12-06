// Dynamic dispatch for functions that cost 2.5GB or less
// The limit was chosen to allow stock buying functions.

// Any function can be executed in here, including one with
// multiple ns calls, as long as their dynamic size remains
// in the limit.

/** @param {NS} ns */
export function main(ns) {
  // Increase our static size by 2.5GB
  ns.stock.buyStock;
  if (!globalThis?.global?.stubcall_reject) {
    // Can happen on game restart, don't throw error dialogs.
    return;
  }
  const func = global.stubcall_func;
  try {
    if (!func) {
      throw new SyntaxError("Stubcall failure");
    }
    const result = func(ns);
    // We don't just use await, because we want to synchronously
    // return for non-async functions.
    if (result?.then) {
      result.then(global.stubcall_cb, global.stubcall_reject);
      return result;
    } else {
      global.stubcall_cb(result);
    }
  } catch (err) {
    global.stubcall_reject(err);
  }
}
