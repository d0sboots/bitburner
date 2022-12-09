import { Heap } from "/lib/heap.js";

const HACK_RAM = 1.7;
const GROW_RAM = 1.75;
const WEAKEN_RAM = 1.75;

/**
 * @param {NS} ns - Worker ns object
 */
function workerStarted(ns, info) {
  // atExit runs *synchronously* right *before* the script is removed
  // from RAM. After we resolve our parent, we know it'll be gone.
  ns.atExit(() => {
    info.resolve([info, info.result]);
  });
  info.startTime = performance.now();
  return ns[info.method](info.target).then((result) => {
    info.endTime = performance.now();
    info.result = result;
  });
}

export class Workers {
  ns;
  heap;
  id = 0;

  /**
   * @param {NS} ns
   * @param {Object.<string, ServerEntry>} serverMap
   */
  constructor(ns, serverMap) {
    this.ns = ns;
    this.heap = new Heap(serverMap);
  }

  /**
   * Internal method - run given pre-allocated RAM
   * @param {string} method
   * @param {string} target
   * @param {ServerEntry} entry
   * @param {number} ramSize
   * @param {number} threads
   */
  _runTask(method, target, entry, ramSize, threads) {
    const id = this.id++;
    const host = entry.server.hostname;
    const info = {
      id: id,
      target: target,
      method: method,
      serverEntry: entry,
      ramSize: ramSize,
      manager: this,
      started: workerStarted,
    };
    (global.workerInfo ??= new Map()).set(id, info);
    const finishPromise = new Promise((resolve, reject) => {
      info.resolve = (x) => {
        this._cleanup(info);
        resolve(x);
      };
      info.reject = (x) => {
        this._cleanup(info);
        reject(x);
      };
    });
    const pid = this.ns["exec"]("/worker/" + method + ".js", host, threads, id);
    if (pid === 0) {
      throw new Error(
        `Couldn't launch ${method} on ${host} with ${threads} threads`
      );
    }
    this.ns.printf(`Launched ${method} on ${host} with ${threads} threads`);
    info.pid = pid;
    return finishPromise;
  }

  _cleanup(workerInfo) {
    const entry = workerInfo.serverEntry;
    this.heap.update(entry, entry.server.ramUsed - workerInfo.ramSize);
    // Can get reset when we restart the script
    global?.workerInfo?.delete?.(workerInfo.id);
  }

  doHack(threads, target) {
    const ram = threads * HACK_RAM;
    const entry = this.heap.allocate(ram);
    if (!entry) {
      return null;
    }
    return this._runTask("hack", target, entry, ram, threads);
  }

  doGrow(threads, target) {
    const ram = threads * GROW_RAM;
    const entry = this.heap.allocateHome(ram);
    if (!entry) {
      return null;
    }
    return this._runTask("grow", target, entry, ram, threads);
  }

  doWeaken(threads, target) {
    const allocs = this.heap.allocateSpread(WEAKEN_RAM, threads);
    if (!allocs.length) {
      return null;
    }
    const promises = allocs.map(([entry, usedThreads]) =>
      this._runTask(
        "weaken",
        target,
        entry,
        WEAKEN_RAM * usedThreads,
        usedThreads
      )
    );
    return Promise.all(promises);
  }
}
