/** Electron's renderer `setTimeout` has no `.unref()`, so real undici timers and HTTP/2 pings crash. */
class NoopDispatcher {
  dispatch() {
    return false;
  }
  close() {
    return Promise.resolve();
  }
  destroy() {
    return Promise.resolve();
  }
}

export class Agent extends NoopDispatcher {}
export class Client extends NoopDispatcher {}
export class Pool extends NoopDispatcher {}
export class EnvHttpProxyAgent extends NoopDispatcher {}

export function setGlobalDispatcher() {}
export function getGlobalDispatcher() {
  return undefined;
}
export function install() {}

export default {
  Agent,
  Client,
  Pool,
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  install,
};
