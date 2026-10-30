//cross-platform build steps: npm runs scripts under cmd.exe on Windows, so no shell commands
//usage: node scripts/build.mjs copy|zip
import {cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {join, relative, sep} from "node:path";
import {crc32, deflateRawSync} from "node:zlib";

const root = join(import.meta.dirname, "..");
const build = join(root, "build");

if (process.argv[2] == "copy") {
  rmSync(build, {recursive: true, force: true});
  cpSync(join(root, "dist"), build, {recursive: true});
}

if (process.argv[2] == "zip") {
  const out = join(root, "package.zip");
  writeFileSync(out, zip(listFiles(build).map(file => ({
    name: relative(build, file).split(sep).join("/"),
    data: readFileSync(file),
  }))));
  console.log("Wrote", relative(process.cwd(), out));
}


function listFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  })
}

//minimal zip writer (deflate, no zip64), enough for an extension package
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const now = new Date();
  const dosTime = now.getHours() << 11 | now.getMinutes() << 5 | now.getSeconds() >> 1;
  const dosDate = (now.getFullYear() - 1980) << 9 | (now.getMonth() + 1) << 5 | now.getDate();
  for (const {name, data} of entries) {
    const nameBuf = Buffer.from(name);
    const body = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);   //utf-8 names
    local.writeUInt16LE(8, 8);        //deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
