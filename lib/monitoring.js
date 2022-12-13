export class Monitor {
  ns;
  heap;
  earnings = []; // Last 60 seconds history, for average tracking
  totalMoney = 0;
  handle; // Handle of refresh timer
  boundFn; // Bound function to pass to setTimeout
  timeout;
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
    this.boundFn = this.doMonitor.bind(this);
    this.timeout = performance.now();
    this.heap = heap;
    this.boundFn();
  }

  cancel() {
    clearTimeout(this.handle);
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

  doMonitor() {
    this.timeout += 1000;
    const income = this.earnings.length
      ? this.earnings.reduce((a, b) => a + b) / this.earnings.length
      : 0;
    this.earnings.unshift(0);
    if (this.earnings.length > 60) {
      this.earnings.pop();
    }
    const totalRam = this.heap.maxRam + "";
    const freeRam = this.ns.sprintf(
      `%${totalRam.length}s`,
      this.heap.maxRam - this.heap.ramUsed
    );
    const targetEnt = global.serverTree[global.target];
    const targetServ = targetEnt.server;
    targetEnt.update(this.ns, this.heap);
    this.ns.clearLog();
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
└──────────────┴────────────────────┘
`,
      targetServ.hostname,
      this.ns.sprintf("$%.0f", targetServ.moneyAvailable),
      this.ns.sprintf("$%.0f", targetServ.moneyMax),
      targetServ.hackDifficulty,
      targetServ.minDifficulty,
      this.ns.sprintf("$%.0f", this.totalMoney),
      this.ns.sprintf("$%.0f", income),
      totalRam,
      freeRam,
      this.sum / this.samples,
      Math.sqrt(this.sumsq / this.samples),
      this.samples
    );
    this.handle = setTimeout(this.boundFn, this.timeout - performance.now());
  }
}
