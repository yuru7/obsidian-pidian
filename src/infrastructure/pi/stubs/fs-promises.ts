/**
 * Node `fs/promises` for the Obsidian bundle. Pidian only reads and writes
 * through the Vault API and vault.adapter, never ~/.pi or the rest of the disk.
 */
function unavailable(method: string): NodeJS.ErrnoException {
  const error = new Error(`Pidian does not access the filesystem (${method})`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function reject(method: string) {
  return async function fsPromiseUnavailable(..._args: unknown[]): Promise<never> {
    throw unavailable(method);
  };
}

export const access = reject("access");
export const appendFile = reject("appendFile");
export const chmod = reject("chmod");
export const copyFile = reject("copyFile");
export const lstat = reject("lstat");
export const mkdir = reject("mkdir");
export const open = reject("open");
export const readFile = reject("readFile");
export const readdir = reject("readdir");
export const realpath = reject("realpath");
export const rename = reject("rename");
export const rm = reject("rm");
export const stat = reject("stat");
export const unlink = reject("unlink");
export const writeFile = reject("writeFile");

export default {
  access,
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
};
