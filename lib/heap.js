import { ServerEntry } from "/lib/scan.js";

// Manage memory access
export class Heap {
  // Each index is a list of ServerEntries fitting this slab size.
  // Slab 0 is for [0,1]GB free, Slab 1 is (1,2]GB, 2 is (2,4]GB, etc.
  // Slab 20 includes 2^20 GB, the largest purchasable size.
  // Home is handled specially.
  slabs = Array.from(Array(21), () => []);
  slabsWithFallback;

  home;
  // Amount to keep free on home at all times, for stubcall and user scripts.
  homeBuffer;

  maxRam = 0;
  ramUsed = 0;

  /** @param {Object.<string, ServerEntry>} serverMap */
  constructor(serverMap, buffer = 12) {
    this.homeBuffer = buffer;
    for (const entry of Object.values(serverMap)) {
      this.addEntry(entry);
    }
    // It's very important that all the slabs share the same array objects.
    this.slabsWithFallback = [...this.slabs, [this.home]];
  }

  // Returns the ServerEntry of the allocated block, or null if none are
  // available. Falls back to home as a last resort.
  allocate(ram) {
    if (ram <= 0 || ram > 0x100000) {
      return null;
    }
    let slab = ram <= 1 ? 0 : 31 - Math.clz32(Math.ceil(ram));
    let best = null;
    for (; slab < 22; ++slab) {
      for (const entry of this.slabsWithFallback[slab]) {
        const free = entry.server.maxRam - entry.server.ramUsed;
        if (
          free >= ram &&
          (!best || free < best.server.maxRam - best.server.ramUsed)
        ) {
          best = entry;
        }
      }
      if (best) break;
    }
    if (best) {
      this.update(best, best.server.ramUsed + ram);
    } else {
      const l = this.slabsWithFallback.map((x) => x.length + "").join(" ");
      console.log(`Failed allocate ${ram}, ${l}`);
    }
    return best;
  }

  // Allocate on home, with fallback to other servers.
  allocateHome(ram) {
    if (ram <= 0 || ram > 0x100000) {
      return null;
    }
    const homeServ = this.home.server;
    if (homeServ.maxRam - homeServ.ramUsed < ram) {
      return this.allocate(ram);
    }
    this.update(this.home, homeServ.ramUsed + ram);
    return this.home;
  }

  // Allocate RAM for size blockSize and "threads" number of threads.
  // This is for weaken(), where the allocs can be spread across many servers.
  // Returns an array of ([ServerEntry, threads])
  // The array will be empty if the request could not be entirely fulfilled.
  allocateSpread(blockSize, threads) {
    if (threads <= 0 || blockSize * threads > 0x100000) {
      return [];
    }
    const result = [];
    for (let slab = 0; slab < 22; ++slab) {
      if (1 << slab < blockSize) {
        continue;
      }
      for (const entry of this.slabsWithFallback[slab]) {
        const server = entry.server;
        const ram = server.maxRam - server.ramUsed;
        if (ram < blockSize) {
          continue;
        }
        const usedThreads = Math.min(threads, (ram / blockSize) | 0);
        result.push([entry, usedThreads]);
        threads -= usedThreads;
        if (threads <= 0) {
          // Update all RAM at once, to avoid issues with partial results
          for (const [entry, usedThreads] of result) {
            this.update(entry, entry.server.ramUsed + usedThreads * blockSize);
          }
          return result;
        }
      }
    }
    return [];
  }

  // For dynamically-added servers
  addEntry(entry) {
    if (entry.heapIdx !== -1) {
      throw new Error(
        `Tried to add entry for ${entry.server.hostname} which is already in a heap!`
      );
    }
    if (!entry.isUseful()) {
      entry.heapIdx = -1;
      return;
    }
    const server = entry.server;
    if (server.hostname === "home") {
      this.home = entry;
      // Artificially adjust free RAM. This can put ramUsed over maxRam, but
      // that is fine.
      server.ramUsed += this.homeBuffer;
      this.maxRam += server.maxRam;
      this.ramUsed += server.ramUsed;
      entry.heapIdx = -1;
      return;
    }
    this.maxRam += server.maxRam;
    this.ramUsed += server.ramUsed;
    const ram = server.maxRam - server.ramUsed;
    const slab = ram <= 1 ? 0 : 31 - Math.clz32(Math.ceil(ram));
    entry.heapIdx = slab;
    this.slabs[slab].push(entry);
  }

  // For when maxRam changes on a host (upgrading servers)
  updateMaxRam(entry, newMaxRam) {
    const server = entry.server;
    this.maxRam += newMaxRam - server.maxRam;
    server.maxRam = newMaxRam;
    this.update(entry, server.ramUsed);
  }

  // Update ramUsed and position in slabs
  update(entry, newRamUsed) {
    const server = entry.server;
    const newRam = server.maxRam - newRamUsed;
    this.ramUsed += newRamUsed - server.ramUsed;
    server.ramUsed = newRamUsed;
    if (server.hostname === "home") {
      return;
    }
    const newSlab = newRam <= 1 ? 0 : 31 - Math.clz32(Math.ceil(newRam));
    // Also catches NaN
    if (!(newSlab <= 20)) {
      throw new Error(
        `newSlab ${newSlab} out of range for ${entry.server.hostname}`
      );
    }
    if (newSlab != entry.heapIdx) {
      const oldSlab = this.slabs[entry.heapIdx];
      const index = oldSlab.indexOf(entry);
      if (index < 0) {
        throw new Error(
          `Couldn't find entry for ${entry.server.hostname} in slab ${entry.heapIdx}`
        );
      }
      oldSlab.splice(oldSlab.indexOf(entry), 1);
      this.slabs[newSlab].push(entry);
      entry.heapIdx = newSlab;
    }
  }
}
