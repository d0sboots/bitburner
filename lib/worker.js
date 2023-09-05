import { Heap } from "/lib/heap.js";
import { Monitor } from "/lib/monitoring.js";
import { stubCall } from "/lib/stubcall.js";
import { createCurrentFormulas } from "/lib/formulas.js";

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
  return ns[info.method](info.target, info.opts).then((result) => {
    const endTime = performance.now();
    info.manager.monitor.recordComplete(
      endTime - info.startTime,
      info.expectedTime * 1000
    );
    info.result = result;
  });
}

export class Workers {
  ns;
  player; // The caller should update this object
  heap;
  monitor;
  formulas;
  id = 0;

  /**
   * @private - Use init() instead!
   * @param {NS} ns
   * @param {Object.<string, ServerEntry>} serverMap
   */
  constructor(ns, serverMap) {
    this.ns = ns;
    this.heap = new Heap(serverMap);
    this.monitor = new Monitor(ns, this.heap);
  }

  static async init(ns, serverMap) {
    const that = new Workers(ns, serverMap);
    await stubCall(ns, (ns) => {
      that.player = ns["getPlayer"]();
      that.formulas = createCurrentFormulas(ns);
    });
    return that;
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
    const targetEnt = global.serverTree[target];
    targetEnt.update(this.ns, false);
    const expectedTime =
      this.formulas.hacking.hackTime(targetEnt.server, this.player) / 1000 *
      { hack: 1, grow: 3.2, weaken: 4 }[method];
    const info = {
      id,
      expectedTime,
      target,
      method,
      serverEntry: entry,
      ramSize,
      manager: this,
      opts: {},
      started: workerStarted,
    };
    if (
      (method === "hack" && global.stock === "sell") ||
      (method === "grow" && global.stock === "buy")
    ) {
      info.opts.stock = true;
    }
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
    const pid = this.ns["exec"](
      "/worker/worker.js",
      host,
      { threads, temporary: true, ramOverride: ramSize / threads },
      id
    );
    if (pid === 0) {
      throw new Error(
        `Couldn't launch ${method} on ${host} with ${threads} threads`
      );
    }
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
    const promise = this._runTask("hack", target, entry, ram, threads);
    promise.then(([info, result]) => {
      if (result > 0) {
        this.monitor.recordHack(result);
      }
    });
    return promise;
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
