// Manage memory access
export class Heap {
  // Each index is a list of ServerEntries fitting this slab size.
  // Slab 0 is for [0,1]GB free, Slab 1 is (1,2]GB, 2 is (2,4]GB, etc.
  // Slab 20 includes 2^20 GB, the largest purchasable size.
  // Home is handled specially.
  slabs = Array.from(Array(21), () => []);

  constructor(serverMap) {
    for (const entry of Object.values(serverMap)) {
      const server = entry.server;
      if (server.hostname === "home") {
        entry.heapIdx = -1;
        continue;
      }
      const ram = server.maxRam - server.ramUsed;
      const slab = ram <= 1 ? 0 : Math.ceil(Math.log2(ram));
      entry.heapIdx = slab;
      this.slabs[slab].push(entry);
    }
  }

  // Returns the ServerEntry of the allocated block, or null if none are
  // available.
  allocate(ram) {
    if (ram <= 0 || ram > 0x100000) {
      return null;
    }
    let slab = ram <= 1 ? 0 : Math.ceil(Math.log2(ram));
    let best;
    for (; slab < 21; ++slab) {
      const target = (1 << slab) - ram;
      for (const entry of this.slabs[slab]) {
        if (
          entry.server.usedRam <= target &&
          best &&
          entry.server.usedRam > best.server.usedRam
        ) {
          best = entry;
        }
      }
      if (best) break;
    }
    this.update(best, best.server.usedRam + ram);
    return best;
  }

  // Allocate RAM for size blockSize and "threads" number of threads.
  // This is for weaken(), where the allocs can be spread across many servers.
  // Returns an array of ([ServerEntry, threads])
  // The array will be empty if the request could not be entirely fulfilled.
  allocateSpread(blockSize, threads) {
    const result = [];
    for (let slab = 0; slab < 21; ++slab) {
      if (1 << slab < blockSize) {
        continue;
      }
      for (const entry of this.slabs[slab]) {
        if (threads <= 0) {
          // Update all RAM at once, to avoid issues with partial results
          for (const [entry, usedThreads] of results) {
            this.update(entry, entry.server.usedRam + usedThreads * blockSize);
          }
          return result;
        }
        const server = entry.server;
        const ram = server.maxRam - server.ramUsed;
        if (ram < blockSize) {
          continue;
        }
        const usedThreads = Math.min(threads, (ram / blockSize) | 0);
        result.push([entry, usedThreads]);
        threads -= usedThreads;
      }
    }
    return [];
  }

  // Does the inverse of allocateSpread
  freeSpread(allocs, blockSize) {
    for (const [entry, usedThreads] of results) {
      this.update(entry, entry.server.usedRam - usedThreads * blockSize);
    }
  }

  // Update position in slabs
  update(entry, newUsedRam) {
    const server = entry.server;
    if (server.hostname === "home") {
      return;
    }
    const newRam = server.maxRam - newUsedRam;
    server.ramUsed = newUsedRam;
    const newSlab = newRam <= 1 ? 0 : Math.ceil(Math.log2(newRam));
    if (newSlab != entry.heapIdx) {
      this.slabs[entry.heapIdx].remove(entry);
      this.slabs[newSlab].push(entry);
      this.heapIdx = newSlab;
    }
  }
}
