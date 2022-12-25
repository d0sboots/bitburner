// Main dispatch loop. Handles all decision-making logic.
import { stubCall } from "/lib/stubcall.js";
import { treeScan, ramDepsUpdate, ServerEntry, PortOpener } from "/lib/scan.js";
import { Workers } from "/lib/worker.js";

const WORKER_SCRIPTS = [
  "/worker/hack.js",
  "/worker/grow.js",
  "/worker/weaken.js",
  "/worker/share.js",
];

/** @param {NS} ns */
function createShares(ns) {
  let shareRam = ns.args[0] ?? 0;
  shareRam -= shareRam % 4;
  shareRam |= 0;
  for (const entry of Object.values(global.serverTree)) {
    const server = entry.server;
    const host = server.hostname;
    if (server.ramUsed) {
      ns.printf("%.2f used ram on %s", server.ramUsed, host);
    }
    const servRam = server.maxRam - server.ramUsed;
    if (shareRam <= 0) break;
    if (!entry.isUseful() || servRam < 4) continue;

    const useRam = Math.min(shareRam, servRam);
    ns.exec("/worker/share.js", host, Math.floor(useRam / 4));
    shareRam -= useRam;
    server.ramUsed += useRam;
  }
}

/** @param {NS} ns */
function hackServers(ns, opener, heap) {
  let rooted = 0,
    newRam = 0;
  opener.ns = ns;
  for (const entry of Object.values(global.serverTree)) {
    const info = entry.server;
    const host = info.hostname;
    if (info.hasAdminRights || !opener.canRoot(info)) {
      continue;
    }
    opener.root(host);
    entry.server = ns["getServer"](host);
    heap.addEntry(entry);
    rooted++;
    newRam += entry.server.maxRam;
  }
  ns.tprintf("Rooted %d new servers totaling %d GB", rooted, newRam);
}

function copyScripts(ns) {
  for (const entry of Object.values(global.serverTree)) {
    const server = entry.server;
    const host = server.hostname;
    if (host === "home" || !entry.isUseful()) {
      continue;
    }
    ns["scp"](WORKER_SCRIPTS, host, "home");
  }
}

// Polls for stuff the human does, and reacts to it.
// Although this returns a promise, there's no expectation that anything awaits
// its result - it won't resolve.
async function watchHuman(ns, setBuffer, heap) {
  let opener = { openablePorts: Array(10) };
  const portCosts = {
    sshPortOpen: 500e3,
    ftpPortOpen: 1500e3,
    smtpPortOpen: 5e6,
    httpPortOpen: 30e6,
    sqlPortOpen: 250e6,
  };
  while (true) {
    const newOpener = await stubCall(ns, (ns_) => {
      // Update in case we bought upgrades
      global.serverTree["home"].server.maxRam = ns_.getServerMaxRam("home");
      return new PortOpener(ns_);
    });
    if (newOpener.openablePorts.length !== opener.openablePorts.length) {
      opener = newOpener;

      await stubCall(ns, (ns_) => hackServers(ns_, opener, heap));
      await stubCall(ns, (ns_) => copyScripts(ns_));
    }
    let buffer = Object.values(portCosts).reduce((a, b) => a + b);
    for (const port of opener.openablePorts) {
      buffer -= portCosts[port];
    }
    if (!global.serverTree["darkweb"]) {
      const darkweb = await stubCall(ns, (ns_) => {
        try {
          return ns_.getServer("darkweb");
        } catch {
          return null;
        }
      });
      if (darkweb) {
        global.serverTree["darkweb"] = new ServerEntry(darkweb, "home", 1);
      } else {
        buffer += 200e3;
      }
    }
    setBuffer(buffer);

    await ns.asleep(500);
  }
}

async function treeInit(ns) {
  // Clear space on home
  ns.killall();
  await stubCall(ns, treeScan);
  await stubCall(
    ns,
    (ns) => (ServerEntry.weakenAnalyze_ = ns["weakenAnalyze"](1))
  );
  await stubCall(ns, (ns) => {
    for (const entry of Object.values(global.serverTree)) {
      entry.hackStatsUpdate(ns);
    }
  });
  for (const host of Object.keys(global.serverTree)) {
    if (host !== "home") {
      ns.killall(host);
      global.serverTree[host].update(ns);
    }
  }
  // Give the UI a chance to do stuff
  await new Promise((resolve) => setTimeout(resolve));
}

/** @param {NS} ns */
export async function main(ns) {
  ramDepsUpdate();
  globalThis.global = {};
  global.workerId = 0;

  ns.tprint("Starting");
  ns.disableLog("ALL");

  await treeInit(ns);
  let moneyBuffer = 10e6; // Don't spend money initially
  let money = -moneyBuffer;
  let nextSleep = performance.now();
  const tree = global.serverTree;

  createShares(ns);
  global.target = ns.args[1] ?? "n00dles";
  const workers = await Workers.init(ns, tree);
  const watch = watchHuman(ns, (x) => (moneyBuffer = x), workers.heap);

  global.threads = [ns.args[2] ?? 3, ns.args[3] ?? 3, ns.args[4] ?? 20];
  global.waitTime = ns.args[5] ?? 25;
  const [serverLimit, serverCosts] = await stubCall(ns, (ns) => {
    const maxRam = ns["getPurchasedServerMaxRam"]();
    const costs = [];
    for (let i = 1; i <= maxRam; i = i << 1) {
      costs.push(ns["getPurchasedServerCost"](i));
    }
    return [ns["getPurchasedServerLimit"](), costs];
  });

  let numServers = 0;
  for (const host of Object.keys(global.serverTree)) {
    if (host.startsWith("bought-")) {
      numServers++;
    }
  }

  workers.monitor.displayTail();
  ns.atExit(() => ns.closeTail());

  while (true) {
    while (money > serverCosts[1] && numServers < serverLimit) {
      const host = "bought-" + numServers;
      if (!(await stubCall(ns, "purchaseServer", host, 2))) {
        throw new Error(
          `Failure to purchaseServer: ${host} for ${serverCosts[1]}`
        );
      }
      await stubCall(ns, "scp", WORKER_SCRIPTS, host);
      tree[host] = new ServerEntry(
        await stubCall(ns, "getServer", host),
        "home",
        1
      );
      workers.heap.addEntry(tree[host]);
      numServers++;
      money -= serverCosts[1];
    }
    // Wait on the watcher, so we catch errors from it.
    // It won't ever resolve normally.
    nextSleep += global.waitTime;
    await Promise.race([watch, ns.asleep(nextSleep - performance.now())]);

    workers.player.skills.hacking = ns.getHackingLevel();
    // Schedule a new set
    workers.doWeaken(global.threads[0], global.target);
    workers.doGrow(global.threads[1], global.target);
    workers.doHack(global.threads[2], global.target);

    money =
      (tree["home"].server.moneyAvailable =
        ns.getServerMoneyAvailable("home")) - moneyBuffer;
    for (let i = 0; i < numServers; i++) {
      const upgHost = "bought-" + i;
      const entry = tree[upgHost];
      const upgradeLvl = 31 - Math.clz32(entry.server.maxRam);
      if (!(money >= serverCosts[upgradeLvl + 1] - serverCosts[upgradeLvl])) {
        // Inverted test catches NaNs
        continue;
      }

      if (
        !(await stubCall(ns, (ns) => {
          ns.enableLog("upgradePurchasedServer");
          return ns["upgradePurchasedServer"](upgHost, 1 << (upgradeLvl + 1));
        }))
      ) {
        throw new Error(
          `Failure to upgradePurchasedServer: ${upgHost} from level ${upgradeLvl}`
        );
      }
      workers.heap.updateMaxRam(entry, 1 << (upgradeLvl + 1));
      money -= serverCosts[upgradeLvl + 1] - serverCosts[upgradeLvl];
    }
  }
}
