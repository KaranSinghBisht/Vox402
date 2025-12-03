import { bytesToHex } from "viem";

export function randomBytes32Hex(): `0x${string}` {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return bytesToHex(buf) as `0x${string}`;
}
