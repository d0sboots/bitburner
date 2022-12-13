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
function createShares(ns, hosts) {
  let shareRam = ns.args[0] ?? 0;
  shareRam -= shareRam % 4;
  shareRam |= 0;
  const tree = global.serverTree;
  for (let i = hosts.length - 1; i >= 0; i--) {
    const host = hosts[i];
    const server = tree[host].server;
    if (server.ramUsed) {
      ns.printf("%.2f used ram on %s", server.ramUsed, host);
    }
    const servRam = server.maxRam - server.ramUsed;
    if (shareRam <= 0) break;
    if (servRam < 4) continue;

    const useRam = Math.min(shareRam, servRam);
    ns.exec("/worker/share.js", host, Math.floor(useRam / 4));
    shareRam -= useRam;
    server.ramUsed += useRam;
    if (useRam == servRam) {
      hosts.splice(i, 1);
    }
  }
}

/** @param {NS} ns */
function hackServers(ns, servers) {
  const targets = [];
  const opener = new PortOpener(ns);
  const output = [];
  for (const host of servers) {
    const info = global.serverTree[host].server;
    if (!info.hasAdminRights) {
      if (!opener.canRoot(info)) {
        continue;
      }
      opener.root(host);
      global.serverTree[host].server = ns["getServer"](host);
    }
    if (info.maxRam < 1.75) {
      output.push(
        ns.sprintf("Ignoring %s because it's tiny: %fGB", host, info.maxRam)
      );
      continue;
    }
    targets.push(host);
  }
  if (output.length) {
    ns.tprintf("%s", output.join("\n"));
  }
  return targets;
}

function copyScripts(ns, servers) {
  for (const host of servers) {
    if (host === "home") {
      continue;
    }
    ns["scp"](WORKER_SCRIPTS, host, "home");
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

  const hosts = await stubCall(ns, (ns) => {
    return hackServers(ns, Object.keys(global.serverTree));
  });
  await stubCall(ns, (ns_) => copyScripts(ns_, hosts));
  return hosts;
}

/** @param {NS} ns */
export async function main(ns) {
  ramDepsUpdate();
  globalThis.global = {};
  global.workerId = 0;

  ns.tprint("Starting");
  ns.disableLog("ALL");

  const hosts = await treeInit(ns);
  createShares(ns, hosts);

  global.target = ns.args[1] ?? "n00dles";
  global.threads = [ns.args[2] ?? 3, ns.args[3] ?? 3, ns.args[4] ?? 40];
  const [serverLimit, cost_2, cost_64] = await stubCall(ns, (ns) => [
    ns["getPurchasedServerLimit"](),
    ns["getPurchasedServerCost"](2),
    ns["getPurchasedServerCost"](64),
  ]);
  const cost_62 = cost_64 - cost_2;

  let numServers = 0,
    numUpgraded = 0;
  for (const host of Object.keys(global.serverTree)) {
    if (host.startsWith("bought-")) {
      numServers++;
    }
  }
  const tree = global.serverTree;
  let money = 0;

  const workers = await Workers.init(ns, tree);
  workers.monitor.displayTail();
  ns.atExit(() => ns.closeTail());

  while (true) {
    while (money > cost_2 && numServers < serverLimit) {
      const host = "bought-" + numServers;
      await stubCall(ns, "purchaseServer", host, 2);
      await stubCall(ns, "scp", WORKER_SCRIPTS, host);
      tree[host] = new ServerEntry(
        await stubCall(ns, "getServer", host),
        "home",
        1
      );
      workers.heap.addEntry(tree[host]);
      numServers++;
      money -= cost_2;
      hosts.push(host);
    }
    workers.player.skills.hacking = ns.getHackingLevel();
    // Schedule a new set
    workers.doWeaken(global.threads[0], global.target);
    workers.doGrow(global.threads[1], global.target);
    workers.doHack(global.threads[2], global.target);

    // Sleep until hack.js wakes us up by calling dispatchResolve.
    await ns.asleep(100);

    money = tree["home"].server.moneyAvailable =
      ns.getServerMoneyAvailable("home");
    for (; numUpgraded < numServers; numUpgraded++) {
      if (money < cost_62) break;
      const upgHost = "bought-" + numUpgraded;
      if (tree[upgHost].server.maxRam >= 64) continue;

      await stubCall(ns, "upgradePurchasedServer", upgHost, 64);
      workers.heap.updateMaxRam(tree[upgHost], 64);
      money -= cost_62;
    }
  }
}
