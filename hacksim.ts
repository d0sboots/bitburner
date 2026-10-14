/** Similar to, but not the same as the standard BasicHGWOptions */
export interface HGWOpts {
  /** Number of threads to use. Defaults to 1. */
  threads?: number;
  /** Additional time to add to the operation, defaults to 0. */
  additionalMsec?: number;
  /** How many cores are on the host running the operation? Defaults to 1. */
  cpuCores?: number;
}

/**
 * Simulation for hacking algorithms.
 *
 * Simulates the effect of hacking arbitrary servers, as well as the effect on
 * the player (levelups). Hack/Grow/Weaken tasks must be scheduled in time just
 * as normal, but RAM allocation is assumed to be fine - you can check the currentRam
 * and maxRam variables to see ram usage.
 *
 * This does not require `ns`, but it does need an instance of Formulas, as well as data
 * on the Player and whatever servers will be hacked. The player and servers passed in will be
 * cloned, so the sim will not affect the values of the passed-in objects.
 * Formulas can be a replacement such as
 * https://github.com/d0sboots/bitburner/blob/main/lib/formulas.js, instead of the real thing.
 */
export class HackSim {
  f: HackingFormulas;
  player: Player;
  servers = new Map<string, Server>();
  actions = new MinHeap<Action>();
  /** Current action timestamp in msec */
  time = 0;
  /** Current RAM usage in MB. Divide by 1000 for GB. */
  currentRamMb = 0;
  /** Maximum RAM usage in MB. Divide by 1000 for GB. */
  maxRamMb = 0;
  /** BN mult */
  hackingLevelMultiplier: number;

  constructor(
    formulas: Formulas,
    player: Player,
    servers: Iterable<Server>,
  ) {
    this.f = formulas.hacking;
    this.hackingLevelMultiplier = getHackingMult(formulas);
    this.player = structuredClone(player);
    // Shallow-copy the servers, removing some extra data
    for (const s of servers) {
      const { neighbors: _, ...copy } = s as Server & {neighbors?: unknown};
      this.servers.set(s.hostname, copy);
    }
  }

  /**
   * @returns the timestamp the operation will complete at.
   *
   * This will throw an error if the server's hack chance is not 100%,
   * since deterministic simulation is impossible otherwise.
   *
   * All H/G/W operations increase the clock by 122ns after they are
   * scheduled, so that they don't occupy the exact same timestamp.
   */
  hack(host: string, opts?: HGWOpts): number {
    const { threads, additionalMsec, cpuCores } = validateHGWOptions(opts);
    const server = this.getNormalServer(host);

    // Calculate the hacking time
    // This is in seconds
    const hackingTime = this.f.hackTime(server, this.player) + additionalMsec;

    // No root access or skill level too low
    this._checkCanHack(server);

    const time = hackingTime + this.time;
    this.actions.push({ action: "hack", time, server, additionalMsec, threads, cpuCores });
    this.adjustRam(1700 * threads);
    this.time += 2 ** -13;

    return time;
  }

  /**
   * @returns the timestamp the operation will complete at.
   *
   * All H/G/W operations increase the clock by 122ns after they are
   * scheduled, so that they don't occupy the exact same timestamp.
   */
  grow(host: string, opts?: HGWOpts): number {
    const { threads, additionalMsec, cpuCores } = validateHGWOptions(opts);
    const server = this.getNormalServer(host);

    this._baseCheck("grow", server);
    const growTime = this.f.growTime(server, this.player) + additionalMsec;
    const time = growTime + this.time;

    this.actions.push({ action: "grow", time, server, additionalMsec, threads, cpuCores });
    this.adjustRam(1750 * threads);
    this.time += 2 ** -13;

    return time;
  }

  /**
   * @returns the timestamp the operation will complete at.
   *
   * All H/G/W operations increase the clock by 122ns after they are
   * scheduled, so that they don't occupy the exact same timestamp.
   */
  weaken(host: string, opts?: HGWOpts): number {
    const { threads, additionalMsec, cpuCores } = validateHGWOptions(opts);
    const server = this.getNormalServer(host);

    this._baseCheck("weaken", server);
    const weakenTime = this.f.weakenTime(server, this.player) + additionalMsec;
    const time = weakenTime + this.time;

    this.actions.push({ action: "weaken", time, server, additionalMsec, threads, cpuCores });
    this.adjustRam(1750 * threads);
    this.time += 2 ** -13;

    return time;
  }

  /**
   * Simulate time moving forward and the event queue running.
   *
   * Time will advance until all events queued at or before newTime have run.
   * The event queue is not *actually* run - all activity here is synchronous! In particular,
   * this means code written with promises for communication won't work - subsequent events will
   * have "already" been completed by the time the promises trigger.
   */
  advanceTime(newTime: number) {
    if (newTime < this.time) {
      throw new Error(`Tried to reverse time from ${this.time} to ${newTime}!`);
    }
    // @ignore-infinite
    while (true) {
      const event = this.actions.peek();
      if (event == null || event.time > newTime) {
        this.time = newTime;
        break;
      }
      this.actions.pop();
      this.time = event.time;
      if (event.action == "hack") {
        this.currentRamMb -= 1700 * event.threads;

        const hackChance = this.f.hackChance(event.server, this.player);
        if (hackChance !== 1) {
          throw new Error(`hackChance was ${hackChance} while trying to hack ${event.server.hostname}. Chance must be 1 for deterministic simulation.`);
        }
        let expGainedOnSuccess = this.f.hackExp(event.server, this.player) * event.threads;
        const expGainedOnFailure = expGainedOnSuccess / 4;

        const percentHacked = this.f.hackPercent(event.server, this.player);
        let maxThreadNeeded = Math.ceil(1 / percentHacked);
        if (isNaN(maxThreadNeeded)) {
          // Server has a 'max money' of 0 (probably). We'll set this to an arbitrarily large value
          maxThreadNeeded = 1e6;
        }

        const moneyAvailable = event.server.moneyAvailable ?? 0;
        let moneyDrained = moneyAvailable * percentHacked * event.threads;

        // Over-the-top safety checks
        if (moneyDrained < 0) {
          moneyDrained = 0;
        }
        if (moneyDrained > moneyAvailable) {
          moneyDrained = moneyAvailable;
        }

        if (moneyDrained === 0) {
          expGainedOnSuccess = expGainedOnFailure;
        }

        event.server.moneyAvailable = moneyAvailable - moneyDrained;
        if (event.server.moneyAvailable < 0) {
          event.server.moneyAvailable = 0;
        }

        // This would normally multiply by scriptGained, but that only applies in BN8,
        // where we won't be running batchers.
        let moneyGained = moneyDrained;

        // All script-based accounting is stripped out here, as well as stock influencing
        this.player.money += moneyGained;
        this.gainHackingExp(expGainedOnSuccess);
        fortify(event.server, 0.002 * Math.min(event.threads, maxThreadNeeded));
      } else if (event.action == "grow") {
        this.currentRamMb -= 1750 * event.threads;

        const oldMoneyAvailable = event.server.moneyAvailable;
        const newMoney = this.f.growAmount(event.server, this.player, event.threads, event.cpuCores);

        // if there was any growth at all, increase security
        if (oldMoneyAvailable !== newMoney) {
          let usedCycles = this.f.growThreads(event.server, this.player, newMoney, event.cpuCores);
          event.server.moneyAvailable = newMoney;
          // Growing increases server security twice as much as hacking
          usedCycles = Math.min(Math.max(0, Math.ceil(usedCycles)), event.threads);
          fortify(event.server, 0.004 * usedCycles);
        }

        const expGain = this.f.hackExp(event.server, this.player) * event.threads;
        this.gainHackingExp(expGain);
      } else {  // weaken
        this.currentRamMb -= 1750 * event.threads;

        const weakenAmt = this.f.weakenEffect(event.threads, event.cpuCores);
        fortify(event.server, -weakenAmt);
        const expGain = this.f.hackExp(event.server, this.player) * event.threads;
        this.gainHackingExp(expGain);
      }
    }
  }

  adjustRam(offset: number) {
    this.currentRamMb += offset;
    if (this.currentRamMb > this.maxRamMb) {
      this.maxRamMb = this.currentRamMb;
    }
  }

  gainHackingExp(exp: number) {
    if (isNaN(exp)) {
      throw new Error("NaN passed into Player.gainHackingExp()");
    }
    this.player.exp.hacking += exp;
    if (this.player.exp.hacking < 0) {
      this.player.exp.hacking = 0;
    }
    const mult = this.player.mults.hacking * this.hackingLevelMultiplier;
    const value = Math.floor(mult * (32 * Math.log(this.player.exp.hacking + 534.6) - 200));
    this.player.skills.hacking = Math.max(value, 1);
  }

  getNormalServer(host: string): Server {
    const server = this.servers.get(host);
    if (server == null) {
      throw new Error(`Cannot be executed on ${host}. Server not found.`);
    } else if (server.moneyMax == null) {
      throw new Error(`Cannot be executed on ${host}. The server is not a regular server.`);
    }
    return server;
  }

  _checkCanHack(server: Server) {
    this._baseCheck("hack", server);
    if ((server.requiredHackingSkill ?? NaN) > this.player.skills.hacking) {
      throw new Error(`Cannot hack ${server.hostname} server because your hacking skill is not high enough`);
    }
  }

  _baseCheck(actionName: string, server: Server) {
    if (server.purchasedByPlayer) {
      throw new Error(`Cannot ${actionName} ${server.hostname} server because it is your server`);
    }
    if (!server.hasAdminRights) {
      throw new Error(`Cannot ${actionName} ${server.hostname} server because you do not have root access`);
    }
  }
}

// Many formulas functions leak information about BN mults in their implementation.
// Unfortunately, calculateSkill is the opposite: The BN mults associated with it
// aren't part of the formulas APIs. But, we can determine the current BN and thus
// the correct mult without having to invoke any additional RAM-costing API calls.
function getHackingMult(formulas: Formulas): number {
  const bnCheck: HackingFormulas & { bnMults?: BitNodeMultipliers } = formulas.hacking;
  if (bnCheck.bnMults) {
    // We are using a replacement formulas, we don't need to do all this work.
    return bnCheck.bnMults.HackingLevelMultiplier;
  }
  // The values are multiplied by 100 so they're integers.
  // Shorthand so the lines don't get too long:
  // level - HackingLevelMultiplier
  // grow - ServerGrowthRate
  // speed - HackingSpeedMultiplier
  // crime - CrimeMoney
  // script - ScriptHackMoney
  //
  // Plus signs are for column alignment.
  // BN 12 is handled specially.
  const mults = [
    { level: 100, grow: 100, speed: 100, crime: 100, script: 100 }, // BN 1
    { level: +80, grow: +80, speed: 100, crime: 300, script: 100 }, // BN 2
    { level: +80, grow: +20, speed: 100, crime: +25, script: +20 }, // BN 3
    { level: 100, grow: 100, speed: 100, crime: +20, script: +20 }, // BN 4
    { level: 100, grow: 100, speed: 100, crime: +50, script: +15 }, // BN 5
    { level: +35, grow: 100, speed: 100, crime: +75, script: +75 }, // BN 6
    { level: 100, grow: 100, speed: 100, crime: 0.0, script: +30 }, // BN 8
    { level: +35, grow: 100, speed: 100, crime: +75, script: +50 }, // BN 7
    { level: 100, grow: 100, speed: 100, crime: 0.0, script: +30 }, // BN 9
    { level: +35, grow: 100, speed: 100, crime: +50, script: +50 }, // BN 10
    { level: +60, grow: +20, speed: 100, crime: 300, script: 100 }, // BN 11
    { level: 100, grow: 100, speed: 100, crime: 100, script: 100 }, // BN 12
    { level: +25, grow: 100, speed: 100, crime: +40, script: +20 }, // BN 13
    { level: +40, grow: 100, speed: +30, crime: +75, script: +30 }, // BN 14
    { level: +60, grow: 100, speed: +60, crime: 100, script: 100 }, // BN 15
  ] as const;
  // Gather the various BN mults through formula-based tests.
  const player = formulas.mockPlayer();
  const server = { ...formulas.mockServer(), cpuCores: 1, hasAdminRights: true };
  // This hackDifficulty is carefully constructed to result in a
  // adjGrowthLog of *exactly* 1/2048. The end result is that
  // calculateServerGrowthLog will return *exactly* currentNodeMults.ServerGrowthRate.
  server.hackDifficulty = 61.425001220703116;
  server.serverGrowth = 204800;
  const serverGrowthRate = Math.log(formulas.hacking.growPercent(server, 1, player));

  // Set these constants so that the operations in calculateHackingTime will be exact,
  // aside from the final division.
  player.skills.hacking = 5; // skillFactor /= 55
  server.requiredHackingSkill = 2;
  server.hackDifficulty = 76; // 76 * 2 * 2.5 = 380, 380 + 500 = 880, 880 / 55 = 16
  const hackingSpeedMultiplier = 80 / formulas.hacking.hackTime(server, player);

  const crimeMoney = formulas.work.crimeGains(player, "Rob Store").money / 400e3;

  server.hackDifficulty = 50; // difficultyMult = 1/2
  server.requiredHackingSkill = 1; // skillMult = 1
  player.mults.hacking_money = 480; // Cancel other mults
  const scriptHackMoney = formulas.hacking.hackPercent(server, player);

  // We use 10 digits of precision, which should leave plenty of digits for random
  // math errors while still being very certain of the result.
  const toMatch = {
    grow: Math.round(serverGrowthRate * 10 ** 10),
    speed: Math.round(hackingSpeedMultiplier * 10 ** 10),
    crime: Math.round(crimeMoney * 10 ** 10),
    script: Math.round(scriptHackMoney * 10 ** 10),
  };
  outer: for (const candidate of mults) {
    for (const k of ["grow", "speed", "crime", "script"] as const) {
      if (candidate[k] * 10 ** 8 !== toMatch[k]) continue outer;
    }
    // We matched all the fingerprinting values, this is our BN
    return candidate.level / 100;
  }
  // No match - either BN 12, or an error
  if (toMatch["grow"] === toMatch.crime && toMatch["grow"] == toMatch.script) {
    // This is the one calculated with the least distortion.
    return scriptHackMoney;
  }
  throw new Error(`Couldn't identify BN from mults! The values were:
ServerGrowthRate: ${serverGrowthRate}
HackingSpeedMultiplier: ${hackingSpeedMultiplier}
CrimeMoney: ${crimeMoney}
ScriptHackMoney: ${scriptHackMoney}`);
}

interface Action {
  time: number;
  additionalMsec: number;
  threads: number;
  cpuCores: number;
  action: "hack" | "grow" | "weaken";
  server: Server;
}

export interface CompleteHGWOptions {
  threads: number;
  additionalMsec: number;
  cpuCores: number;
}

function number(argName: string, v: unknown): number {
  if (typeof v === "string") {
    const x = parseFloat(v);
    if (!isNaN(x)) return x; // otherwise it wasn't even a string representing a number.
  } else if (typeof v === "number") {
    if (isNaN(v)) throw new Error(`'${argName}' is NaN.`);
    return v;
  }
  throw new Error(`'${argName}' must be a number. ${typeof v}`);
}


function validateHGWOptions(opts: unknown): CompleteHGWOptions {
  const result: CompleteHGWOptions = {
    threads: 1,
    additionalMsec: 0,
    cpuCores: 1,
  };
  if (opts == null) {
    return result;
  }
  if (typeof opts !== "object") {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    throw new Error(`HGWOps must be an object if specified, was ${opts}`);
  }
  // Safe assertion since threadOrOption type has been narrowed to a non-null object
  const options = opts as CompleteHGWOptions;
  result.additionalMsec = number("opts.additionalMsec", options.additionalMsec ?? 0);
  if (result.additionalMsec < 0) {
    throw new Error(`additionalMsec must be non-negative, got ${options.additionalMsec}`);
  }
  if (result.additionalMsec > 1e9) {
    throw new Error(`additionalMsec too large (>1e9), got ${options.additionalMsec}`);
  }
  const requestedThreads = options.threads;
  if (requestedThreads != null) {
    const positiveThreads = number("opts.threads", requestedThreads);
    if (!(positiveThreads > 0)) {
      throw new Error(`opts.threads must be a positive number, was ${positiveThreads}`);
    }
    result.threads = positiveThreads;
  }
  const cpuCores = options.cpuCores;
  if (cpuCores != null) {
    const positiveCores = number("opts.cpuCores", cpuCores);
    if (!(positiveCores > 0)) {
      throw new Error(`opts.cpuCores must be a positive number, was ${positiveCores}`);
    }
    result.cpuCores = positiveCores;
  }

  return result;
}

function fortify(server: Server, amt: number) {
  const hd = (server.hackDifficulty ?? 1) + amt;
  const minDiff = Math.max(server.minDifficulty ?? 0, 1);
  server.hackDifficulty = Math.min(Math.max(hd, minDiff), 100);
}

type HeapItem = { time: number };

/**
 * Bare-bones min-heap to simulate the event queue.
 */
class MinHeap<T extends HeapItem> {
  heap: Array<T> = [];

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(x: T) {
    const h = this.heap;
    let curr = h.length;
    // Bubble new value up in the heap
    while (curr > 0) {
      const parent = (curr - 1) >> 1;
      if (h[parent].time <= x.time) {
        break;
      }
      h[curr] = h[parent];
      curr = parent;
    }
    h[curr] = x;
  }

  pop(): T {
    const h = this.heap;
    let curr = h.length;
    if (curr === 0) {
      throw new Error("Tried to pop() empty heap!");
    }
    const retval = h[0];
    const x = h[curr - 1];
    h.length--;
    if (h.length === 0) return retval;
    curr = 0;
    let child;
    let cidx = 1;
    // Bubble the value we swapped in down in the heap.
    // We don't actually swap, but write it once we find the proper location.
    while (cidx < h.length) {
      child = h[cidx];
      if (cidx + 1 < h.length && h[cidx + 1].time < child.time) {
        cidx++;
        child = h[cidx];
      }
      if (x.time <= child.time) {
        break;
      }
      h[curr] = child;
      curr = cidx;
      cidx = cidx * 2 + 1;
    }
    h[curr] = x;
    return retval;
  }

  peek(): T | undefined {
    return this.heap[0];
  }
}
