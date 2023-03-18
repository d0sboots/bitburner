/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("run");
  ns.disableLog("kill");
  const orig = React.createElement;
  let resolve;
  // Pull the save function from the button on the character menu
  React.createElement = function (...args) {
    const props = args[1];
    if (props && props.save && props.killScripts) {
      React.createElement = orig;
      resolve(props.save);
    }
    return orig.call(this, ...args);
  };
  const resultP = Promise.race([
    new Promise((res) => (resolve = res)),
    ns.asleep(1000),
  ]).finally(() => {
    React.createElement = orig;
  });
  // Force a rerender
  ns.ui.setTheme(ns.ui.getTheme());
  const saveFunc = await resultP;
  if (!saveFunc) {
    ns.tprint("ERROR: Couldn't find save function!");
    return;
  }

  const COPIES = 10000;
  ns.write(
    "benchmark_save_helper.js",
    `
/** @param {NS} ns */
export function main(ns) {
  ns.writePort(ns.args[0], "");
  return ns.asleep(300000);
}`.trim(),
    "w"
  );
  ns.tprintf("Launching %d copies...", COPIES);
  const beforeLaunch = performance.now();
  ns.atExit(() => {
    const host = ns.getHostname();
    for (let i = 0; i < COPIES; ++i) {
      ns.kill("benchmark_save_helper.js", host, ns.pid, i);
    }
  });
  const promise = ns.getPortHandle(ns.pid).nextWrite();
  for (let i = 0; i < COPIES; ++i) {
    const pid = ns.run("benchmark_save_helper.js", 1, ns.pid, i);
    if (pid < 1) {
      ns.tprintf("Failed to launch copy %d, benchmark failed", i);
      return;
    }
  }
  const afterLaunch = performance.now();
  ns.tprintf("Launched in %.3f seconds", 0.001 * (afterLaunch - beforeLaunch));
  await promise;
  const afterStart = performance.now();

  ns.tprintf(
    "Scripts started in %.3f seconds. Saving game...",
    0.001 * (afterStart - afterLaunch)
  );
  await ns.asleep(0);
  const before = performance.now();
  saveFunc();
  await ns.asleep(0);
  const after = performance.now();
  ns.tprintf("Saving took %.3f seconds", 0.001 * (after - before));
}
