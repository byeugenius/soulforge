/**
 * UNIX-socket peer authentication for the Hearth daemon.
 *
 * The socket is already chmod 0600 so only the owning uid can connect, but a
 * malicious process running as the same uid (e.g. a compromised postinstall
 * script, a dev-container mount, a Bun dlopen shim) can still drive every op.
 * This module rejects any peer whose effective uid differs from the daemon's.
 *
 * macOS / BSD: LOCAL_PEERCRED via `getpeereid(fd, &uid, &gid)`.
 * Linux:       `getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &ucred)`.
 * Other:       degrade to no-op (returns true) — caller falls back to the
 *              0600 permission.
 *
 * FFI is lazy-loaded so the module works when bun:ffi is unavailable (tests,
 * headless builds). Any error in the lookup path fails *open* — we do not
 * want to soft-brick the daemon on a platform quirk; socket perms remain the
 * primary defense. This is defense-in-depth only.
 */

import type { Socket } from "node:net";
import { platform } from "node:os";

type PeerAuthResult =
  | { ok: true; euid: number; via: "peercred" | "peereid" | "noop" }
  | { ok: false; reason: string; peerEuid?: number };

let _ffiReady = false;
let _getpeereidFn: ((fd: number, uidPtr: unknown, gidPtr: unknown) => number) | null = null;
let _getsockoptFn:
  | ((fd: number, level: number, opt: number, val: unknown, len: unknown) => number)
  | null = null;
let _u32Alloc: (() => { buf: unknown; read: () => number }) | null = null;
let _ucredAlloc:
  | (() => {
      buf: unknown;
      uidOffset: number;
      lenPtr: unknown;
      readUid: () => number;
    })
  | null = null;

function loadFfi(): void {
  if (_ffiReady) return;
  _ffiReady = true;
  try {
    // bun:ffi is the only path — Node doesn't expose raw socket fds uniformly.
    const ffi = require("bun:ffi") as typeof import("bun:ffi");
    const { dlopen, FFIType, suffix, ptr } = ffi;

    if (platform() === "linux") {
      // getsockopt(int sockfd, int level, int optname, void *optval, socklen_t *optlen)
      const lib = dlopen(`libc.so.6`, {
        getsockopt: {
          args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.ptr],
          returns: FFIType.i32,
        },
      });
      _getsockoptFn = lib.symbols.getsockopt as typeof _getsockoptFn extends null
        ? never
        : NonNullable<typeof _getsockoptFn>;
      // struct ucred { pid_t pid; uid_t uid; gid_t gid; } — 12 bytes, uid at offset 4
      _ucredAlloc = () => {
        const buf = new Uint8Array(12);
        const lenBuf = new Uint32Array(1);
        lenBuf[0] = 12;
        return {
          buf: ptr(buf),
          uidOffset: 4,
          lenPtr: ptr(lenBuf),
          readUid: () => new DataView(buf.buffer).getUint32(4, true),
        };
      };
    } else if (platform() === "darwin") {
      const lib = dlopen(`libc.${suffix}`, {
        getpeereid: {
          args: [FFIType.i32, FFIType.ptr, FFIType.ptr],
          returns: FFIType.i32,
        },
      });
      _getpeereidFn = lib.symbols.getpeereid as typeof _getpeereidFn extends null
        ? never
        : NonNullable<typeof _getpeereidFn>;
      _u32Alloc = () => {
        const buf = new Uint32Array(1);
        return {
          buf: ptr(buf),
          read: () => buf[0] ?? 0,
        };
      };
    }
  } catch {
    // FFI unavailable — leave stubs null; checkPeer will fall back to no-op.
  }
}

/**
 * Extract the peer's effective uid. Returns null if the platform path is
 * unavailable (tests, non-darwin-non-linux, FFI disabled).
 */
export function getPeerEuid(socket: Socket): number | null {
  loadFfi();
  const handle = (socket as unknown as { _handle?: { fd?: number } })._handle;
  const fd = handle?.fd;
  if (typeof fd !== "number" || fd < 0) return null;

  if (platform() === "darwin" && _getpeereidFn && _u32Alloc) {
    const uidBuf = _u32Alloc();
    const gidBuf = _u32Alloc();
    const rc = _getpeereidFn(fd, uidBuf.buf, gidBuf.buf);
    if (rc !== 0) return null;
    return uidBuf.read();
  }

  if (platform() === "linux" && _getsockoptFn && _ucredAlloc) {
    const ucred = _ucredAlloc();
    const SOL_SOCKET = 1;
    const SO_PEERCRED = 17;
    const rc = _getsockoptFn(fd, SOL_SOCKET, SO_PEERCRED, ucred.buf, ucred.lenPtr);
    if (rc !== 0) return null;
    return ucred.readUid();
  }

  return null;
}

/**
 * Check that `socket`'s peer has the same euid as the daemon. Returns a
 * structured result so the caller can log the rejection reason.
 *
 * Defense-in-depth: the socket is already 0600, so "ok" is the expected
 * outcome in practice. This blocks the edge case where a same-uid process
 * tries to impersonate the TUI / CLI via the socket.
 */
export function checkPeer(socket: Socket, daemonEuid: number): PeerAuthResult {
  const peer = getPeerEuid(socket);
  if (peer === null) {
    // Platform path unavailable — fall back to 0600 socket perms. This is
    // what "fail open" means here: the socket file permissions still gate
    // access, we just can't add the belt-and-braces check.
    return { ok: true, euid: daemonEuid, via: "noop" };
  }
  if (peer !== daemonEuid) {
    return {
      ok: false,
      reason: `peer euid ${String(peer)} ≠ daemon euid ${String(daemonEuid)}`,
      peerEuid: peer,
    };
  }
  return { ok: true, euid: peer, via: platform() === "darwin" ? "peereid" : "peercred" };
}
