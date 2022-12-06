// Change this if you have a different naming scheme.
const PURCHASED_SERVER_PREFIX = "bought-";

export class ServerEntry {
  server; // ns.getServer() object, contains most data
  parent; // Node above us in the tree
  depth; // Depth in the tree, "home" is 0
  heapIdx = -1; // Position in free heap

  constructor(server, parent, depth) {
    this.server = server;
    this.parent = parent;
    this.depth = depth;
  }

  // Returns true if usedRAM changed.
  // Uses less dynamic RAM than a full getServer() call.
  // (0.25GB total)
  update(ns, heap) {
    const host = this.server.hostname;
    this.server.hackDifficulty = ns["getServerSecurityLevel"](host);
    this.server.moneyAvailable = ns["getServerMoneyAvailable"](host);

    const newUsedRam = ns["getServerUsedRam"](host);
    if (newUsedRam !== this.server.ramUsed) {
      if (heap) {
        heap.update(this, newUsedRam);
      } else {
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
/**
 * Can server be hacked?
 * @param {string[]} homeFiles - List of .exe files on home
 * @param {Server} server
 */
export function canHack(homeFiles, server) {
  let hackable = 0;
  for (const file of homeFiles) {
    // Hostname is always a defined property, so it will always
    // cause the test to fail.
    if (!server[PROGRAMS_MAP[file] ?? "hostname"]) {
      hackable++;
    }
  }
  return hackable + server.openPortCount >= server.numOpenPortsRequired;
}

/**
 * Print the server tree to the terminal
 * @param {NS} ns
 */
export function printTree(ns) {
  const tree = global.serverTree;
  const homeFiles = ns["ls"]("home", ".exe");
  let boughtCount = 0;
  const output = [];
  for (const host of Object.keys(tree)) {
    if (host.startsWith(PURCHASED_SERVER_PREFIX)) {
      boughtCount++;
      continue;
    }
    const info = tree[host];
    output.push(
      ns.sprintf(
        "%s%s  (%dGB skill:\x1b[%dm%d\x1b[0m)",
        "  ".repeat(info.depth),
        host,
        info.server.maxRam,
        canHack(homeFiles, info.server) ? 37 : 31,
        info.server.requiredHackingSkill
      )
    );
  }
  if (boughtCount) {
    output.push(ns.sprintf("  %sN * %s", PURCHASED_SERVER_PREFIX, boughtCount));
  }
  ns.tprintf("%s", output.join("\n"));
}

/**
 * Scan all servers, saved to global variables, and print the tree.
 * @param {NS} ns
 */
export function treeScan(ns) {
  globalThis.global ??= {};

  const serverTree = {};

  scanRecurse(ns, "home", null, 0, serverTree);
  global.serverTree = serverTree;
  printTree(ns);
}

/** @param {NS} ns */
export async function main(ns) {
  // Entry-point for commandline.
  // We declare all the functions used here, so static RAM is allocated.
  // These won't count against scripts that import the library functions.
  ns.ls;
  ns.scan;
  ns.getHackingLevel;
  ns.getServer;
  treeScan(ns);
}
