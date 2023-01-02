// This is a basically a direct copy from the source.
class BadRng {
  x;
  m = 1024;
  a = 341;
  c = 1;

  constructor() {
    this.x = 0;
    this.reset();
  }

  step() {
    this.x = (this.a * this.x + this.c) % this.m;
  }

  random() {
    this.step();
    return this.x / this.m;
  }

  reset() {
    this.x = 0;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  if (!ns.args[0] || typeof ns.args[0] !== "string") {
    ns.tprintf("ERROR: Need initial sequence of flips to align sequence!");
    ns.tprintf('Specify flips with "run coinflip.js HTHTTH" etc.');
    return;
  }
  const chr = [];
  const rng = new BadRng();
  for (let i = 0; i < 1024; ++i) {
    chr[i] = rng.random() < 0.5 ? "H" : "T";
  }
  let haystack = chr.join("");
  haystack += haystack.slice(0, ns.args[0].length - 1);
  const re = RegExp(ns.args[0], "g");
  let goodIdx, result;
  let numResults = 0;
  while ((result = re.exec(haystack))) {
    goodIdx = result.index;
    re.lastIndex = result.index + 1;
    numResults++;
  }
  if (numResults !== 1) {
    ns.tprintf(
      "ERROR: Needed 1 match, but found %d matching sequences",
      numResults
    );
    if (numResults === 0) {
      ns.tprintf("You made a mistake, or there is a program error.");
    } else {
      ns.tprintf("Try gathering more coin flips.");
    }
    return;
  }
  const cut = goodIdx + ns.args[0].length;
  haystack = haystack.slice(cut, 1024) + haystack.slice(0, cut);

  ns.clearLog();
  ns.tail();
  await ns.asleep(5);
  ns.resizeTail(389, 673);
  const output = [];
  let line = "";
  for (let i = 0; i < 256; ++i) {
    line += haystack.slice(i * 4, i * 4 + 4);
    if (i % 8 == 7) {
      output.push(line);
      if (i % 32 == 31) {
        output.push("");
      }
      line = "";
      continue;
    }
    line += " ";
    if (i % 4 == 3) {
      line += " ";
    }
  }
  ns.printf("%s", output.join("\n"));
}
