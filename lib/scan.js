import {
  hackTime as hackTime_,
  growTime as growTime_,
  weakenTime as weakenTime_,
  hackChance as hackChance_,
} from "lib/formulas.js";

// Change this if you have a different naming scheme.
const PURCHASED_SERVER_PREFIX = "bought-";

// Import this if you need to call ServerEntry.Update
export function ramDepsUpdate() {
  const ns = {};
  ns.getServerMoneyAvailable; // 0.1 GB
  ns.getServerSecurityLevel; // 0.1 GB
  ns.getServerUsedRam; // 0.05 GB
}

// Import this if you need to call scanOnly()
export function ramDepsScanOnly() {
  const ns = {};
  ns.scan; // 0.2 GB
  ns.getServer; // 2.0 GB
}

// Import this if you need to call treeScan()
export function ramDepsTreeScan() {
  const ns = {};
  ns.ls; // 0.2 GB
  ramDepsScanOnly();
}

// Import this if you need to call hackStatsUpdate()
export function ramDepsHackStats() {
  const ns = {};
  ns.hackAnalyze; // 1 GB
  ns.growthAnalyze; // 1 GB
  ns.getServerSecurityLevel; // 0.1 GB
}

// Import this if you need to call PortOpener.root()
export function ramDepsPortOpener() {
  const ns = {};
  ns.ls; // 0.2 GB
  ns.brutessh; // 0.05 GB
  ns.ftpcrack; // 0.05 GB
  ns.relaysmtp; // 0.05 GB
  ns.httpworm; // 0.05 GB
  ns.sqlinject; // 0.05 GB
  ns.nuke; // 0.05 GB
}

export class ServerEntry {
  server; // ns.getServer() object, contains most data
  parent; // Node above us in the tree
  depth; // Depth in the tree, "home" is 0
  heapIdx = -1; // Position in free heap

  // Saved results from calling the corresponding functions, used to calculate
  // needed stats on-the-fly.
  hackAnalyze_;
  growthAnalyze_;
  recordedHackDifficulty; // The difficulty at the time the analyze calls were made.

  static weakenAnalyze_ = null;

  constructor(server, parent, depth) {
    this.server = server;
    this.parent = parent;
    this.depth = depth;
  }

  isUseful() {
    return (
      this.server.hasAdminRights &&
      this.server.maxRam >= 2 &&
      !this.server.hostname.startsWith("hacknet-server-")
    );
  }

  // Returns true if usedRAM changed.
  // Uses less dynamic RAM than a full getServer() call.
  // (0.25GB total)
  // Pass "false" (as opposed to undefined) to avoid updating ram usage
  // entirely.
  update(ns, heap) {
    const host = this.server.hostname;
    this.server.hackDifficulty = ns["getServerSecurityLevel"](host);
    this.server.moneyAvailable = ns["getServerMoneyAvailable"](host);

    let newUsedRam = ns["getServerUsedRam"](host);
    if (host === "home" && heap) {
      // Maintain the artificial free buffer
      newUsedRam += heap.homeBuffer;
    }
    if (newUsedRam !== this.server.ramUsed) {
      if (heap) {
        ns.tprintf(
          "WARNING: Server %s out of sync on ramUsed, was %.2f but should be %.2f",
          host,
          this.server.ramUsed,
          newUsedRam
        );
        heap.update(this, newUsedRam);
      } else if (heap !== false) {
        this.server.ramUsed = newUsedRam;
      }
      return true;
    }
    return false;
  }

  // Sets fields needed to get accurate hacking predictions about this server.
  // Requires 2.1GB of unique ns calls.
  hackStatsUpdate(ns) {
    const host = this.server.hostname;
    this.hackAnalyze_ = ns["hackAnalyze"](host); // 1 GB
    this.growthAnalyze_ = ns["growthAnalyze"](host, Math.E); // 1 GB
    this.recordedHackDifficulty = ns["getServerSecurityLevel"](host); // 0.1GB
    // These factors are pulled from the game code for growth calculation.
    // They're used to make growthBase more efficient.
    const adjGrowthRateRecorded = Math.min(
      1 + 0.03 / this.recordedHackDifficulty,
      1.0035
    );
    this.growthBaseFactor =
      1 / (Math.log(adjGrowthRateRecorded) * this.growthAnalyze_);
  }

  // Hacking stats functions. Many of these require having called
  // hackStatsUpdate() first.

  /** @param {Person} person */
  hackChance_(person) {
    return hackChance_(this.server, person);
  }

  /** @param {Person} person */
  hackTime_(person) {
    return hackTime_(this.server, person);
  }

  hackPercent_(ns, person) {
    const s = this.server;
    if (this.hackAnalyze_ === 0) {
      try {
        return ns.formulas.hacking.hackPercent(s, person);
      } catch {}
    }
    const hackAdj =
      (100 - s.hackDifficulty) / (100 - this.recordedHackDifficulty);
    return Math.min(1, this.hackAnalyze_ * hackAdj);
  }

  /**
   * e^growthBase is the percent of money gained with 1 thread. Includes the
   * coreBonus factor. To adjust for the additive term, use
   * numCycleForGrowthCorrected.
   */
  growthBase() {
    const s = this.server;
    // These factors are pulled from the game code for growth calculation.
    // They're used to turn current growth rate to growth rate assuming min security.
    const adjGrowthRate = Math.min(1 + 0.03 / s.hackDifficulty, 1.0035);
    const threadMultiplier =
      (1 + (s.cpuCores - 1) / 16) * this.growthBaseFactor;
    return Math.log(adjGrowthRate) * threadMultiplier;
  }

  // Returns (close to) the fractional number of threads needed to grow *this
  // server* from originalMoney to full. I.e. passing moneyMax will always return 0.
  // This takes current cores into account, and assumes current security.
  // Taking Math.ceil() of this will always give the correct number of integer
  // threads.
  numCycleForGrowthCorrected(originalMoney, guess = 0, eps = 0.5) {
    const s = this.server;
    const moneyDiff = s.moneyMax - originalMoney;
    if (moneyDiff <= 0) return 0;
    const growthBase = this.growthBase();
    // Shorthand vars: growthBase = b, threads = x, moneyMax = m, originalMoney = o
    // The formula we're dealing with is
    //   (o + x) * e^(b*x) = m
    // The logarithmic form will have better convergance:
    //   log(o + x) + b*x = log(m)
    //
    // Using Newton's method:
    //   log(o + x) + b*x - log(m) = y
    //   1/(o + x) + b = y'
    //   x_next = x - y/y'
    //
    //   x_next = x - (log(o + x) + b*x - log(m)) / (1/(o + x) + b)
    //   = x * (1/(o + x) + b) / (1/(o + x) + b) - (log((o + x)/m) + b*x) / (1/(o + x) + b)
    //   = (x/(o + x) + b*x - log((o + x)/m) - b*x) / (1/(o + x) + b)
    //   = (x/(o + x) - log((o + x)/m)) / (1/(o + x) + b)
    //   = (o + x) * (x/(o + x) - log((o + x)/m)) / ((o + x) * (1/(o + x) + b))
    //   = (x - (o + x)*log((o + x)/m)) / (1 + (o + x)*b)
    const invMoney = 1 / s.moneyMax;
    // Clamp the initial guess against inputs that would put it out of range,
    // or lead to slow convergance. The inverted test catches NaN.
    if (!(guess > 0 && guess < moneyDiff)) {
      // moneyDiff makes a good initial guess. However, using it causes the
      // log part to equal 0, so we can do one iteration here cheaply to get a
      // much better guess.
      guess = moneyDiff / (1 + s.moneyMax * growthBase);
    }
    // Now we iterate until it converges well enough.
    while (true) {
      const ox = originalMoney + guess;
      const nextGuess =
        (guess - ox * Math.log(ox * invMoney)) / (1 + ox * growthBase);
      if (nextGuess - guess > eps || guess - nextGuess > eps) {
        guess = nextGuess;
        continue;
      }
      // We know nextGuess is now very close to the answer, but there could
      // still be be rounding issues when using the result. We can use the
      // properties of the function to help: Since y'' is always negative, but
      // y' is always positive, we know that any guess to the right of the
      // target wil overshoot, and any guess to the left will undershoot.
      const ceil = Math.ceil(nextGuess);
      if (nextGuess <= guess) {
        // Overshoot case: The correct answer is between the two guesses
        if (guess < ceil) return nextGuess;
        // Try against full formula
        if (
          (originalMoney + ceil) * Math.exp(growthBase * ceil) >=
          s.moneyMax
        ) {
          return nextGuess;
        } else {
          return guess;
        }
      } else {
        // Undershoot case: The correct answer is greater than nextGuess
        // But it won't be farther than this step away
        if (ceil - nextGuess >= nextGuess - guess) return nextGuess;
        // Try against full formula
        if (
          (originalMoney + ceil) * Math.exp(growthBase * ceil) >=
          s.moneyMax
        ) {
          return nextGuess;
        } else {
          // Will ceil to the next largest integer, while being close to nextGuess.
          // The constant is 1 + EPSILON, to ensure that it will always round
          // up to the next integer.
          return ceil * 1.0000000000000002;
        }
      }
    }
  }

  /** @param {Person} person */
  growTime_(person) {
    return growTime_(this.server, person);
  }

  weakenAnalyze_() {
    return ServerEntry.weakenAnalyze_ / (1 + (this.server.cpuCores - 1) / 16);
  }

  /** @param {Person} person */
  weakenTime_(person) {
    return weakenTime_(this.server, person);
  }
}

/** @param {NS} ns */
function scanRecurse(ns, host, parent, depth, serverMap) {
  serverMap[host] = new ServerEntry(ns["getServer"](host), parent, depth);
  depth++;
  const scanned = ns["scan"](host);
  // The first entry connects back to the parent
  for (let i = host === "home" ? 0 : 1; i < scanned.length; ++i) {
    scanRecurse(ns, scanned[i], host, depth, serverMap);
  }
}

const PROGRAMS_MAP = {
  "BruteSSH.exe": "sshPortOpen",
  "FTPCrack.exe": "ftpPortOpen",
  "relaySMTP.exe": "smtpPortOpen",
  "HTTPWorm.exe": "httpPortOpen",
  "SQLInject.exe": "sqlPortOpen",
};
const PORTS_MAP = {
  sshPortOpen: "brutessh",
  ftpPortOpen: "ftpcrack",
  smtpPortOpen: "relaysmtp",
  httpPortOpen: "httpworm",
  sqlPortOpen: "sqlinject",
};
export class PortOpener {
  ns;
  openablePorts = [];

  /** @param {NS} ns */
  constructor(ns) {
    this.ns = ns;
    for (const file of ns["ls"]("home", ".exe")) {
      const port = PROGRAMS_MAP[file];
      if (port) {
        this.openablePorts.push(port);
      }
    }
  }

  /**
   * Can server be rooted?
   * @param {Server} server
   */
  canRoot(server) {
    let hackable = 0;
    for (const port of this.openablePorts) {
      if (!server[port]) {
        hackable++;
      }
    }
    return hackable + server.openPortCount >= server.numOpenPortsRequired;
  }

  /**
   * Use all available crackers against host, then nuke.
   * Will throw if !canRoot()
   * @param {string} host
   */
  root(host) {
    for (const port of this.openablePorts) {
      this.ns[PORTS_MAP[port]](host);
    }
    this.ns["nuke"](host);
  }
}

/**
 * Print the server tree to the terminal
 * @param {NS} ns
 */
export function printTree(ns) {
  const tree = global.serverTree;
  const checker = new PortOpener(ns);
  let boughtStats = [0, 0];
  let hacknetStats = [0, 0];
  const output = [];
  for (const host of Object.keys(tree)) {
    const info = tree[host];
    if (host.startsWith(PURCHASED_SERVER_PREFIX)) {
      boughtStats[0]++;
      boughtStats[1] += info.server.maxRam;
      continue;
    }
    if (host.startsWith("hacknet-server-")) {
      hacknetStats[0]++;
      hacknetStats[1] += info.server.maxRam;
      continue;
    }
    output.push(
      ns.sprintf(
        "%s%s  (%dGB skill:\x1b[%dm%d\x1b[0m)",
        "  ".repeat(info.depth),
        host,
        info.server.maxRam,
        checker.canRoot(info.server) ? 37 : 31,
        info.server.requiredHackingSkill
      )
    );
  }
  if (boughtStats[0]) {
    output.push(
      ns.sprintf("  %sN * %s (%dGB)", PURCHASED_SERVER_PREFIX, ...boughtStats)
    );
  }
  if (hacknetStats[0]) {
    output.push(
      ns.sprintf("  %sN * %s (%dGB)", "hacknet-server-", ...hacknetStats)
    );
  }
  ns.tprintf("%s", output.join("\n"));
}

/**
 * Return a map of ServerEntry.
 * @param {NS} ns
 */
export function scanOnly(ns) {
  const serverTree = {};
  scanRecurse(ns, "home", null, 0, serverTree);
  return serverTree;
}

/**
 * Scan all servers, saved to global variables, and print the tree.
 * @param {NS} ns
 */
export function treeScan(ns) {
  globalThis.global ??= {};

  const serverTree = {};

  global.serverTree = scanOnly(ns);
  printTree(ns);
}

/** @param {NS} ns */
export async function main(ns) {
  // Entry-point for commandline.
  ramDepsTreeScan();
  treeScan(ns);
}
