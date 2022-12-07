// Main dispatch loop. Handles all decision-making logic.
import { stubCall } from "/lib/stubcall.js";
import { treeScan, ramDepsUpdate, ServerEntry, PortOpener } from "/lib/scan.js";

const WORKER_SCRIPTS = [
  "/worker/hack.js",
  "/worker/grow.js",
  "/worker/weaken.js",
  "/worker/share.js",
];

/** @param {NS} ns */
function oneHost(ns, host) {
  const stats = global.dispatchStats;
  const target = global.target;

  global.serverTree[host].update(ns);
  global.serverTree[target].update(ns);
  const hostInfo = global.serverTree[host].server;
  const targetInfo = global.serverTree[target].server;
  // Keep some spare space on home for running one-off scripts

  const threads = Math.floor(
    Math.round(
      100 * (hostInfo.maxRam - hostInfo.ramUsed) - (host === "home" ? 410 : 0)
    ) / 175
  );
  if (threads < 1) {
    ns.tprintf("ERROR: Calculated 0 threads for %s", host);
    return;
  }

  let method = "hack";
  if (
    targetInfo.hackDifficulty - targetInfo.minDifficulty >
    0.05 * threads * (stats.weaken + 1)
  ) {
    method = "weaken";
  } else if (
    targetInfo.moneyAvailable / targetInfo.moneyMax <
    Math.pow(0.75, stats.grow + 1)
  ) {
    //ns.tprintf("Grow:%f avail:%f max_money:%f", stats.grow,
    //    targetInfo.moneyAvailable, targetInfo.moneyMax);
    method = "grow";
  }
  global.workerInfo ??= {};
  const id = global.workerId++;
  const info = (global.workerInfo[id] = {
    target: target,
    method: method,
    host: host,
  });
  info.promise = new Promise((resolve, reject) => {
    info.resolve = resolve;
    info.reject = reject;
  });
  stats.hosts ??= {};

  const pid = ns.exec("/worker/" + method + ".js", host, threads, id);
  if (pid === 0) {
    throw new Error(
      "Couldn't launch hack on " + host + " with " + threads + " threads"
    );
  }
  info.pid = pid;
  stats.hosts[host] = true;
  stats[method]++;
}

/** @param {NS} ns */
function createShares(ns) {
  let shareRam = ns.args[0] ?? 0;
  shareRam -= shareRam % 4;
  shareRam |= 0;
  const tree = global.serverTree;
  for (let i = global.hosts.length - 1; i >= 0; i--) {
    const host = global.hosts[i];
    const servRam = tree[host].server.maxRam;
    if (shareRam <= 0) break;
    if (servRam < 4) continue;

    const useRam = Math.min(shareRam, servRam);
    ns.exec("/worker/share.js", host, Math.floor(useRam / 4));
    shareRam -= useRam;
    if (useRam == servRam) {
      global.hosts.splice(i, 1);
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

function copyScripts(ns, servers) {
  for (const host of servers) {
    if (host !== "home") {
      for (const script of WORKER_SCRIPTS) {
        ns["rm"](script, host);
      }
      ns["scp"](WORKER_SCRIPTS, host, "home");
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
  ns.disableLog("disableLog");
  ns.disableLog("enableLog");
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
      }
    }
  });
  // Give the UI a chance to do stuff
  await new Promise((resolve) => setTimeout(resolve));

  global.hosts = await stubCall(ns, (ns) => {
    return hackServers(ns, Object.keys(global.serverTree));
  });
  await stubCall(ns, (ns) => copyScripts(ns, global.hosts));

  createShares(ns);

  global.target = ns.args[1] ?? "n00dles";
  global.cb = {};
  const stats = (global.dispatchStats ??= {
    hack: 0,
    weaken: 0,
    grow: 0,
    hosts: {},
  });
  const serverLimit = await stubCall(ns, "getPurchasedServerLimit");
  let numServers = 0;
  for (const host of Object.keys(global.serverTree)) {
    if (host.startsWith("bought-")) {
      numServers++;
    }
  }
  const tree = global.serverTree;
  let money = 0;
  while (true) {
    while (money > 110000 && numServers < serverLimit) {
      const host = "bought-" + numServers;
      await stubCall(ns, "purchaseServer", host, 2);
      await stubCall(ns, "scp", WORKER_SCRIPTS, host);
      tree[host] = new ServerEntry(
        await stubCall(ns, "getServer", host),
        "home",
        1
      );
      numServers++;
      money -= 110000;
      global.hosts.push(host);
    }
    // Run the whole loop every time, in case global.hosts changed
    for (const host of global.hosts) {
      if (!stats.hosts[host]) {
        oneHost(ns, host);
      }
    }
    // Sleep until hack.js wakes us up by calling dispatchResolve.
    const [info, id, result] = await Promise.race(
      Object.values(global.workerInfo).map((x) => x.promise)
    );
    //await null;

    const lastHost = info.host;
    stats[info.method]--;
    stats.hosts[lastHost] = null;
    delete global.workerInfo[id];

    money = tree["home"].server.moneyAvailable =
      ns.getServerMoneyAvailable("home");
    if (money < 110000 * 32 || !lastHost.startsWith("bought-")) continue;
    if (global.serverTree[lastHost].server.maxRam >= 64) continue;

    await stubCall(ns, "upgradePurchasedServer", lastHost, 64);
    tree[lastHost].server = await stubCall(ns, "getServer", lastHost);
    money -= 110000 * 32;
  }
}
