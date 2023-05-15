import { stubCall } from "/lib/stubcall.js";

export class Monitor {
  ns;
  heap;
  earnings = []; // Last 60 seconds history, for average tracking
  totalMoney = 0;
  handle; // Handle of refresh timer
  sum = 0;
  sumsq = 0;
  samples = 0;
  currentTarget = null;

  /**
   * @param {NS} ns
   * @param {Heap} heap
   */
  constructor(ns, heap) {
    this.ns = ns;
    this.timeout = performance.now();
    this.heap = heap;
    this.doMonitor();
  }

  displayTail() {
    this.ns.tail();
    setTimeout(() => this.ns.resizeTail(360, 255), 5);
  }

  recordHack(amt) {
    this.earnings[0] += amt;
    this.totalMoney += amt;
  }

  recordComplete(time, expected) {
    const diff = time - expected;
    this.sum += diff;
    this.sumsq += diff * diff;
    this.samples++;
  }

  async doMonitor() {
    while (true) {
      const income = this.earnings.length
        ? this.earnings.reduce((a, b) => a + b) / this.earnings.length
        : 0;
      this.earnings.unshift(0);
      if (this.earnings.length > 60) {
        this.earnings.pop();
      }
      const targetEnt = global.serverTree[global.target];
      const targetServ = targetEnt.server;
      await stubCall(this.ns, (ns) => targetEnt.update(ns, this.heap));
      this.ns.clearLog();
      const moneyFmt = (x) => {
        const pf = this.ns.sprintf("$%.0f", x);
        const ef = this.ns.sprintf("$%.6e", x);
        return ef.length < pf.length ? ef : pf;
      };
      this.ns.printf(
        `
┌──────────────┬────────────────────┐
│ Target       │ %18s │
│ Current $$$  │ %18s │
│ Max Serv $$$ │ %18s │
│ Security     │ %18.2f │
│ Min Security │ %18.2f │
│ Total income │ %18s │
│ Money/sec    │ %18s │
│ Total RAM    │ %15.2f GB │
│ Free RAM     │ %15.2f GB │
│ Avg jitter   │ %15.2f ms │
│ Stddev jitter│ %15.2f ms │
│ Total ops    │ %18d │
└──────────────┴────────────────────┘`,
        targetServ.hostname,
        moneyFmt(targetServ.moneyAvailable),
        moneyFmt(targetServ.moneyMax),
        targetServ.hackDifficulty,
        targetServ.minDifficulty,
        moneyFmt(this.totalMoney),
        moneyFmt(income),
        this.heap.maxRam,
        this.heap.maxRam - this.heap.ramUsed,
        this.sum / this.samples,
        Math.sqrt(this.sumsq / this.samples),
        this.samples
      );
      await this.ns.asleep(1000);
    }
  }
}
