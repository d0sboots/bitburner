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
            if not file_.endswith(".js"):
                continue
            path = os.path.join(dirpath, file_)
            with open(path) as fh:
                # Strip leading dot
                files[path[1:]] = fh.read()

    print("""export function main(ns) {
  for (const [path, content] of Object.entries(data)) {
    ns.tprintf("Writing %s...", path);
    ns.write(path, content, "w");
  }
}

var data = """ + json.dumps(files, ensure_ascii=False))
