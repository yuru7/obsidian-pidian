/**
 * Replaces Node's `fs`. Pidian does not read or write files outside the vault
 * and plugin directory; those go through the Obsidian vault API.
 *
 * `existsSync` is false so Pi's package.json walk and Google ADC probes look
 * like a missing path. Everything else is ENOENT (callback-style included).
 */
import * as promises from "./fs-promises";

function unavailable(method: string): NodeJS.ErrnoException {
  const error = new Error(`Pidian does not access the filesystem (${method})`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function fail(method: string) {
  return function fsUnavailable(...args: unknown[]): void {
    const last = args[args.length - 1];
    const cb = typeof last === "function" ? (last as (error: NodeJS.ErrnoException) => void) : undefined;
    const error = unavailable(method);
    if (cb) {
      queueMicrotask(() => cb(error));
      return;
    }
    throw error;
  };
}

export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
};

export function existsSync(..._path: unknown[]): boolean {
  return false;
}

export const access = fail("access");
export const accessSync = fail("accessSync");
export const appendFile = fail("appendFile");
export const appendFileSync = fail("appendFileSync");
export const chmod = fail("chmod");
export const chmodSync = fail("chmodSync");
export const close = fail("close");
export const closeSync = fail("closeSync");
export const copyFile = fail("copyFile");
export const copyFileSync = fail("copyFileSync");
export const createReadStream = fail("createReadStream");
export const createWriteStream = fail("createWriteStream");
export const fstat = fail("fstat");
export const fstatSync = fail("fstatSync");
export const lstat = fail("lstat");
export const lstatSync = fail("lstatSync");
export const mkdir = fail("mkdir");
export const mkdirSync = fail("mkdirSync");
export const open = fail("open");
export const openSync = fail("openSync");
export const read = fail("read");
export const readFile = fail("readFile");
export const readFileSync = fail("readFileSync");
export const readdir = fail("readdir");
export const readdirSync = fail("readdirSync");
export const readSync = fail("readSync");
export const realpath = fail("realpath");
export const realpathSync = fail("realpathSync");
export const rename = fail("rename");
export const renameSync = fail("renameSync");
export const rm = fail("rm");
export const rmSync = fail("rmSync");
export const stat = fail("stat");
export const statSync = fail("statSync");
export const unlink = fail("unlink");
export const unlinkSync = fail("unlinkSync");
export const globSync = fail("globSync");
export const unwatchFile = fail("unwatchFile");
export const watch = fail("watch");
export const watchFile = fail("watchFile");
export const write = fail("write");
export const writeFile = fail("writeFile");
export const writeFileSync = fail("writeFileSync");

export { promises };

export default {
  constants,
  existsSync,
  access,
  accessSync,
  appendFile,
  appendFileSync,
  chmod,
  chmodSync,
  close,
  closeSync,
  copyFile,
  copyFileSync,
  createReadStream,
  createWriteStream,
  fstat,
  fstatSync,
  lstat,
  lstatSync,
  mkdir,
  mkdirSync,
  open,
  openSync,
  promises,
  read,
  readFile,
  readFileSync,
  readdir,
  readdirSync,
  readSync,
  realpath,
  realpathSync,
  rename,
  renameSync,
  rm,
  rmSync,
  stat,
  statSync,
  unlink,
  unlinkSync,
  globSync,
  unwatchFile,
  watch,
  watchFile,
  write,
  writeFile,
  writeFileSync,
};
