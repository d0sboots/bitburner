import { mainLoop } from "./hack.js";

/** @param {NS} ns */
export function main(ns) {
  return mainLoop(ns, ns.grow);
}
