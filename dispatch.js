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
      if (!opener.canHack(info)) {
        continue;
      }
      opener.hack(host);
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

function copyScripts(ns, parentNs, servers) {
  // scp is very expensive, because it requires rescanning the files.
  // We'll use hack.js to check for changes, instead.
  global.workerInfo ??= new Map();
  const files = WORKER_SCRIPTS.map((x) => ns.read(x));
  let numServers = 0;
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  for (const host of servers) {
    if (host === "home") {
      continue;
    }
    numServers++;
    const goFunc = (workerNs, info) => {
      global?.workerInfo?.delete?.(info.id);
      const workerFiles = workerNs
        ? WORKER_SCRIPTS.map((x) => workerNs.read(x))
        : null;
      for (let i = 0; i < WORKER_SCRIPTS.length; ++i) {
        if (!workerFiles || workerFiles[i] !== files[i]) {
          ns["rm"](WORKER_SCRIPTS[i], host);
          ns["scp"](WORKER_SCRIPTS[i], host, "home");
        }
      }
    };
    const info = {
      id: host,
      started: goFunc,
    };
    global.workerInfo.set(host, info);
    // Use the parent ns for this, it's already paid for exec and we can't
    // afford it in the stub.
    if (parentNs["exec"]("/worker/hack.js", host, 1, host) === 0) {
      goFunc(null, info);
    }
  }
}

/** @param {NS} ns */
async function analyze(ns, host) {
  const serverFortifyAmount = 0.002;
  const serverWeakenAmount = 0.05;
  result = {
    hackAnalyze: await stubCall(ns, "hackAnalyze", host),
    hackAnalyzeChance: await stubCall(ns, "hackAnalyzeChance", host),
    growthAnalyze: await stubCall(ns, "growthAnalyze", host),
    hackTime: await stubCall(ns, "getHackTime", host),
  };
  result.growth = Math.exp(1.0 / result["growthAnalyze"]);
  result.growTime = result.hackTime * 3.2;
  result.weakenTime = result.hackTime * 4;
  return result;
}

/** @param {NS} ns */
export async function main(ns) {
  ramDepsUpdate();
  globalThis.global = {};
  global.workerId = 0;

  ns.tprint("Starting");
  ns.disableLog("ALL");
  // Clear space on home
  for (const { filename, pid, args: args_ } of ns.ps()) {
    if (
      filename === "dispatch.js" &&
      ns.args.length === args_.length &&
      ns.args.every((x, i) => x === args_[i])
    ) {
      continue;
    }
    ns.kill(pid);
  }
  await stubCall(ns, treeScan);
  await stubCall(ns, (ns) => {
    for (const host of Object.keys(global.serverTree)) {
      if (host !== "home") {
        ns["killall"](host);
        global.serverTree[host].update(ns);
      }
    }
  });
  // Give the UI a chance to do stuff
  await new Promise((resolve) => setTimeout(resolve));

  const hosts = await stubCall(ns, (ns) => {
    return hackServers(ns, Object.keys(global.serverTree));
  });
  await stubCall(ns, (ns_) => copyScripts(ns_, ns, hosts));

  createShares(ns, hosts);

  global.target = ns.args[1] ?? "n00dles";
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
  const workers = new Workers(ns, tree);
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
      numServers++;
      money -= cost_2;
      hosts.push(host);
    }
    // Schedule a new set
    workers.doWeaken(2, global.target);
    workers.doGrow(2, global.target);
    workers.doHack(44, global.target);

    // Sleep until hack.js wakes us up by calling dispatchResolve.
    await ns.sleep(100);

    money = tree["home"].server.moneyAvailable =
      ns.getServerMoneyAvailable("home");
    for (; numUpgraded < numServers; numUpgraded++) {
      if (money < cost_62) break;
      const upgHost = "bought-" + numUpgraded;
      if (tree[upgHost].server.maxRam >= 64) continue;

      await stubCall(ns, "upgradePurchasedServer", upgHost, 64);
      tree[upgHost].server = await stubCall(ns, "getServer", upgHost);
      money -= cost_62;
    }
  }
}
