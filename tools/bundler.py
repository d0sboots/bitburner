#!/usr/bin/python3
"""Quick-and-dirty bundler.

This isn't like webpack - it makes an installer.js, which creates/updates
the tree of files. Also not like a self-extracting exe, because there's no
compression.
"""

import json
import os
import sys

if __name__ == "__main__":
    files = {}
    wanted = {os.path.join(".", x) for x in sys.argv[1:]}
    for dirpath, dirnames, filenames in os.walk("."):
        if dirpath == ".":
            dirnames.remove("tools")
        for file_ in filenames:
            if not file_.endswith(".js") or file_.endswith("installer.js"):
                continue
            path = os.path.join(dirpath, file_)
            if wanted and path not in wanted:
                continue
            with open(path) as fh:
                if len(dirpath) == 1:
                    # Root dir files must be bare
                    adjpath = file_
                else:
                    # Strip leading dot, keep slash
                    adjpath = path[1:]
                files[adjpath] = fh.read()
    if not files:
        raise ValueError("No files matched args: " + repr(sys.argv[1:]))

    with open("installer.js", "w") as out:
        print("Writing to installer.js...")
        print("""export async function main(ns) {
  const buffer = [];
  if (ns.args[0] === "-w") {
    // Wait until change
    ns.tprintf("Waiting for new installer.js version...");
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (ns.ls("home", ns.args[1]).length) {
        buffer.push("New version of installer.js received!");
        break;
      }
      await ns.asleep(100);
    }
    if (Date.now() >= deadline) {
      ns.tprintf("WARNING: No new installer.js, gave up after 10 seconds.");
      return;
    }
    ns.mv("home", ns.args[1], "installer.js");
    ns.run("installer.js");
    return;
  }
  for (const [path, content] of Object.entries(data)) {
    if (content === ns.read(path)) {
      buffer.push(ns.sprintf("Skipped %s", path));
    } else {
      buffer.push(ns.sprintf("Writing %s...", path));
      ns.write(path, content, "w");
    }
  }
  ns.tprintf("%s", buffer.join("\\n"));
}

var data = """ + json.dumps(files, ensure_ascii=False), file=out)
