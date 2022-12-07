import { Heap } from "/lib/heap.js";

const HACK_RAM = 1.7;
const GROW_RAM = 1.75;
const WEAKEN_RAM = 1.75;

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
    global.workerInfo ??= {};
    const id = this.id++;
    const host = entry.server.hostname;
    const info = (global.workerInfo[id] = {
      target: target,
      method: method,
      serverEntry: entry,
      ramSize: ramSize,
    });
    info.promise = new Promise((resolve, reject) => {
      info.resolve = (x) => {
        this._cleanup(info);
        resolve(x);
      };
      info.reject = (x) => {
        this._cleanup(info);
        reject(x);
      };
    });
    const pid = ns["exec"]("/worker/" + method + ".js", host, threads, id);
    if (pid === 0) {
      throw new Error(
        "Couldn't launch hack on " + host + " with " + threads + " threads"
      );
    }
    info.pid = pid;
    return info.promise;
  }

  _cleanup(workerInfo) {
    const entry = workerInfo.serverEntry;
    this.heap.update(entry, entry.server.usedRam - workerInfo.ramSize);
  }

  doHack(threads, target) {
    const ram = threads * HACK_RAM;
    const entry = this.heap.allocate(ram);
    if (!entry) {
      return null;
    }
    return _runTask("hack", target, entry, ram, threads);
  }

  doGrow(threads, target) {
    const ram = threads * GROW_RAM;
    const entry = this.heap.allocateHome(ram);
    if (!entry) {
      return null;
    }
    return _runTask("grow", target, entry, ram, threads);
  }

  doWeaken(threads, target) {
    const allocs = this.heap.allocateSpread(WEAKEN_RAM, threads);
    if (!allocs.length) {
      return null;
    }
    const promises = allocs.map(([entry, usedThreads]) =>
      _runTask("weaken", target, entry, WEAKEN_RAM * usedThreads, usedThreads)
    );
    return Promise.all(promises);
  }
}
