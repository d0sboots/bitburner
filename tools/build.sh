#!/bin/sh -ex

rm -rf ./tmp
mkdir -p ./tmp
find ./ \( -path "./tmp" -o -path "./node_modules" -o -path "./test" \) -prune -o -name '*.ts' -exec cp --parents {} tmp/ ';'
find ./tmp -type f -print0 | xargs -0 sed -i"" 's/^$/\/\/%EMPTY LINE%/'
node_modules/typescript/bin/tsc
find ./tmp -type f -print0 | sed -z 's/\/tmp//;s/.ts$/.js/' | xargs -0 sed -i"" 's/\/\/%EMPTY LINE%$//'
find ./tmp -type f -print0 | sed -z 's/\/tmp//;s/.ts$/.js/' | xargs -0 node_modules/prettier/bin/prettier.cjs -c -w
