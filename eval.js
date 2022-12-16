/** @param {NS} ns */
export async function main(ns) {
  // Bloat RAM size by 2.5GB so we can eval some ns functions.
  ns.buyStock;
  ns.tprint(eval(ns.args[0]));
}
