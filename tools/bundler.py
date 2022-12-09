#!/usr/bin/python3
"""Quick-and-dirty bundler.

This isn't like webpack - it makes an installer.js, which creates/updates
the tree of files. Also not like a self-extracting exe, because there's no
compression.
"""

import json
import os

if __name__ == "__main__":
    files = {}
    for dirpath, dirnames, filenames in os.walk("."):
        if dirpath == ".":
            dirnames.remove("tools")
        for file_ in filenames:
            if not file_.endswith(".js") or file_ == "installer.js":
                continue
            path = os.path.join(dirpath, file_)
            with open(path) as fh:
                if len(dirpath) == 1:
                    # Root dir files must be bare
                    adjpath = file_
                else:
                    # Strip leading dot, keep slash
                    adjpath = path[1:]
                files[adjpath] = fh.read()

    with open("installer.js", "w") as out:
        print("Writing to installer.js...")
        print("""export function main(ns) {
  const buffer = [];
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
