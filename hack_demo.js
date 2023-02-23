// Demonstration of new HGWOptions API. Creates 3000 H/G/W workers
// that execute as fast as possible.
// Requires ~5220GB free on home.

/** @param {NS} ns */
function createWorkerScript(ns, wType) {
  ns.write(
    `/worker/hack_demo_${wType}.js`,
    `
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const port = ns.getPortHandle(ns.pid);
  let now = performance.now();
  while (true) {
    port.write(now);
    await port.nextWrite();
    await ns.${wType}(target, { additionalMsec: port.read() });
  }
}
    `.trim(),
    "w"
  );
}

/** @param {NS} ns */
export async function main(ns) {
  const target = "n00dles";
  const BATCHES = 1000;
  const WORKERS = BATCHES * 3;

  const startTime = performance.now();
  ns.disableLog("ALL");
  ns.tail();
  const order = ["hack", "grow", "weaken"];
  for (const wType of order) {
    createWorkerScript(ns, wType);
  }
  for (const process of ns.ps()) {
    if (process.filename.startsWith("/worker/hack_demo_")) {
      ns.kill(process.pid);
    }
  }
  const workers = [];
  const ports = [];
  ns.atExit(() => {
    for (let i = 0; i < workers.length; ++i) ns.kill(workers[i]);
  });

  // Start a throwaway set of jobs, to compile
  for (let j = 0; j < 3; ++j) {
    const pid = ns.run(`/worker/hack_demo_${order[j]}.js`, 1, target);
    if (!pid) {
      throw new Error(`Failed to run starter script #${j}`);
    }
    workers[j] = pid;
    ports[j] = ns.getPortHandle(pid);
  }
  await ports[2].nextWrite();
  for (let j = 0; j < 3; ++j) {
    ns.kill(workers[j]);
  }

  const compileTime = performance.now();

  for (let i = 0; i < WORKERS; i += 3) {
    for (let j = 0; j < 3; ++j) {
      const pid = ns.run(`/worker/hack_demo_${order[j]}.js`, 1, target, i);
      if (!pid) {
        throw new Error(`Failed to run script #${i + j}`);
      }
      workers[i + j] = pid;
      ports[i + j] = ns.getPortHandle(pid);
    }
  }

  const offset = ns.args[0] ?? 0.1;

  const launchedTime = performance.now();

  ns.printf("Compiled in %.1fms, Launched %d scripts in %.1fms", compileTime - startTime, WORKERS, launchedTime - compileTime);

  let first = true;
  while (true) {
    const hackTime = ns.getHackTime(target);
    const times = [hackTime * 3.0 + offset, hackTime * 0.8 + offset, offset];

    const loopStart = performance.now();
    if (first === false) {
      for (let i = 0; i < WORKERS; i+=3) {
        for (let j = 0; j < 3; ++j) {
          ports[i+j].write(times[j]);
        }
      }
    }

    const loopEnd = performance.now();
    await ports[WORKERS-1].nextWrite();
    const loop2Start = performance.now();

    const firstTime = ports[0].read();
    let last = firstTime;
    for (let i = 1; i < WORKERS; ++i) {
      const time = ports[i].read();
      if (time < last) {
        throw new Error(`Script #${i} with pid ${workers[i]} out-of-order: Ran at ${time} when previous script ran at ${last}`);
      }
      last = time;
    }
    const loop2End = performance.now();
    if (!first) {
      ns.printf("Signaled: %.1fms, Waiting: %.1fms, Running: %.1fms, ReadPort: %.1fms",
        loopEnd - loopStart, loop2Start - loopEnd, last - firstTime, loop2End - loop2Start);
    }
    first = false;
  }
}
