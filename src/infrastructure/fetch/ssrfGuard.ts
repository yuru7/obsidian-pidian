import { BlockList, isIPv4, isIPv6 } from "node:net";
import { promises as dns } from "node:dns";
import { BlockedUrlError, InvalidUrlError } from "../../domain/fetch/FetchErrors";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsLookup = (hostname: string) => Promise<ResolvedAddress[]>;

const blockedV4 = new BlockList();
blockedV4.addSubnet("127.0.0.0", 8, "ipv4");
blockedV4.addSubnet("10.0.0.0", 8, "ipv4");
blockedV4.addSubnet("172.16.0.0", 12, "ipv4");
blockedV4.addSubnet("192.168.0.0", 16, "ipv4");
blockedV4.addSubnet("169.254.0.0", 16, "ipv4");
blockedV4.addAddress("0.0.0.0", "ipv4");

const blockedV6 = new BlockList();
blockedV6.addAddress("::1", "ipv6");
blockedV6.addAddress("0:0:0:0:0:0:0:1", "ipv6");
blockedV6.addAddress("::", "ipv6");
blockedV6.addSubnet("fc00::", 7, "ipv6");
blockedV6.addSubnet("fe80::", 10, "ipv6");

export async function defaultDnsLookup(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((item) => ({
    address: item.address,
    family: item.family === 6 ? 6 : 4,
  }));
}

export function parseHttpUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new InvalidUrlError();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidUrlError();
  }
  if (!url.hostname) {
    throw new InvalidUrlError();
  }
  return url;
}

export function isBlockedAddress(address: string): boolean {
  const mapped = ipv4FromMapped(address);
  if (mapped) {
    return blockedV4.check(mapped, "ipv4");
  }
  if (isIPv4(address)) {
    return blockedV4.check(address, "ipv4");
  }
  if (isIPv6(address)) {
    return blockedV6.check(address, "ipv6");
  }
  return false;
}

export class SsrfGuard {
  constructor(private readonly lookup: DnsLookup = defaultDnsLookup) {}

  async assertSafe(urlString: string): Promise<URL> {
    const url = parseHttpUrl(urlString);
    const host = normalizeHostname(url.hostname);
    if (isBlockedHostname(host)) {
      throw new BlockedUrlError();
    }
    const literal = literalIp(host);
    if (literal) {
      if (isBlockedAddress(literal)) {
        throw new BlockedUrlError();
      }
      return url;
    }
    let addresses: ResolvedAddress[];
    try {
      addresses = await this.lookup(host);
    } catch {
      throw new InvalidUrlError("Could not resolve hostname.");
    }
    if (addresses.length === 0) {
      throw new InvalidUrlError("Could not resolve hostname.");
    }
    if (addresses.some((item) => isBlockedAddress(item.address))) {
      throw new BlockedUrlError();
    }
    return url;
  }
}

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function literalIp(hostname: string): string | undefined {
  if (isIPv4(hostname) || isIPv6(hostname)) {
    return hostname;
  }
  return parseDecimalIPv4(hostname);
}

function parseDecimalIPv4(hostname: string): string | undefined {
  if (!/^\d+$/.test(hostname)) {
    return undefined;
  }
  const value = Number(hostname);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    return undefined;
  }
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function ipv4FromMapped(address: string): string | undefined {
  const lower = address.toLowerCase();
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted?.[1] && isIPv4(dotted[1])) {
    return dotted[1];
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex?.[1] || !hex[2]) {
    return undefined;
  }
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}
