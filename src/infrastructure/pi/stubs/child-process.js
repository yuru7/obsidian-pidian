/**
 * Replaces both Pi's spawn helpers and Node's `child_process`.
 * Pidian does not run a shell; Google Auth's optional `gcloud` probe is treated as missing.
 */
function unavailable(method) {
  const error = new Error(`Pidian does not execute shell commands (${method})`);
  error.code = "ENOENT";
  return error;
}

function failedSync(method) {
  const error = unavailable(method);
  return { status: 1, stdout: "", stderr: "", error, pid: 0, signal: null, output: [null, "", ""] };
}

function fakeChild() {
  return {
    pid: 0,
    stdin: null,
    stdout: null,
    stderr: null,
    stdio: [],
    killed: false,
    connected: false,
    exitCode: 1,
    signalCode: null,
    spawnargs: [],
    spawnfile: "",
    kill() {
      return true;
    },
    send() {
      return false;
    },
    disconnect() {},
    unref() {},
    ref() {},
    on() {
      return this;
    },
    once() {
      return this;
    },
    off() {
      return this;
    },
    addListener() {
      return this;
    },
    removeListener() {
      return this;
    },
  };
}

export function spawn() {
  throw unavailable("spawn");
}
export function spawnSync() {
  return failedSync("spawnSync");
}
export function exec() {
  throw unavailable("exec");
}
export function execSync() {
  throw unavailable("execSync");
}
export function execFile() {
  throw unavailable("execFile");
}
export function execFileSync() {
  throw unavailable("execFileSync");
}
export function fork() {
  throw unavailable("fork");
}

export function spawnProcess() {
  return fakeChild();
}

export function spawnProcessSync() {
  return failedSync("spawnProcessSync");
}

export async function waitForChildProcess() {
  return 1;
}

export default {
  spawn,
  spawnSync,
  exec,
  execSync,
  execFile,
  execFileSync,
  fork,
};
