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
