"""
Aerospin – Provably Fair Engine
================================
Every spin or deal is deterministic given (server_seed, client_seed, nonce).
Players can independently verify any outcome using the public server_seed_hash
before the round and the revealed server_seed after the round ends.

Verification flow
-----------------
1.  Server generates a random ``server_seed`` and publishes its SHA-256 hash
    (``server_seed_hash``) to the player **before** any bet is placed.
2.  Player optionally sets their own ``client_seed`` (default: random UUID4).
3.  Each spin increments a ``nonce`` (starts at 0 per client_seed pair).
4.  The combined HMAC-SHA512 digest is used to derive float outcomes in [0, 1).
5.  After the player decides to rotate seeds, the ``server_seed`` is revealed.
    The player can verify: SHA-256(server_seed) == server_seed_hash.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import struct
import uuid
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Core cryptographic helpers
# ---------------------------------------------------------------------------

def _hmac_sha512(key: bytes, msg: bytes) -> bytes:
    """Return HMAC-SHA512(key, msg)."""
    return hmac.new(key, msg, hashlib.sha512).digest()


def _bytes_to_floats(digest: bytes, count: int) -> list[float]:
    """
    Convert a 64-byte HMAC-SHA512 digest into up to ``count`` floats in [0, 1).

    Each float uses 4 bytes (big-endian uint32) divided by 2**32.
    The digest can yield at most 16 independent floats; for more, chain nonces.
    """
    floats: list[float] = []
    for i in range(count):
        offset = i * 4
        if offset + 4 > len(digest):
            break
        (uint32,) = struct.unpack_from(">I", digest, offset)
        floats.append(uint32 / (2**32))
    return floats


def derive_outcomes(
    server_seed: str,
    client_seed: str,
    nonce: int,
    count: int = 5,
) -> list[float]:
    """
    Derive ``count`` independent float outcomes in [0, 1) for one spin.

    Parameters
    ----------
    server_seed : str
        Secret seed held by the server (revealed after round).
    client_seed : str
        Seed chosen or acknowledged by the player.
    nonce : int
        Monotonically increasing counter; unique per (server_seed, client_seed).
    count : int
        Number of independent values needed (e.g. number of reels).

    Returns
    -------
    list[float]
        ``count`` floats, each in [0, 1), derived from HMAC-SHA512.
    """
    key = server_seed.encode()
    msg = f"{client_seed}:{nonce}".encode()
    digest = _hmac_sha512(key, msg)
    return _bytes_to_floats(digest, count)


# ---------------------------------------------------------------------------
# Higher-level spin result
# ---------------------------------------------------------------------------

@dataclass
class SpinResult:
    server_seed_hash: str   # SHA-256(server_seed) – shown before round
    client_seed: str
    nonce: int
    raw_floats: list[float]  # Intermediate values for auditability
    reel_stops: list[int]    # Mapped symbol indices (0-based)
    server_seed: str = ""    # Revealed after round; empty during play


@dataclass
class ProvablyFairEngine:
    """
    Stateful engine that manages seed rotation and nonce tracking.

    Usage
    -----
    ::

        engine = ProvablyFairEngine()
        result = engine.spin(reel_symbol_counts=[10, 10, 10, 10, 10])
        # After player decides to check:
        engine.reveal_server_seed()   # exposes server_seed on past results
        engine.rotate_seeds()         # generates fresh server_seed for next round
    """

    _server_seed: str = field(default_factory=lambda: _generate_seed())
    _client_seed: str = field(default_factory=lambda: str(uuid.uuid4()))
    _nonce: int = 0
    _history: list[SpinResult] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def server_seed_hash(self) -> str:
        """SHA-256 commitment to the current server seed."""
        return hashlib.sha256(self._server_seed.encode()).hexdigest()

    @property
    def client_seed(self) -> str:
        return self._client_seed

    @client_seed.setter
    def client_seed(self, value: str) -> None:
        """Player may change their client seed; resets nonce to 0."""
        self._client_seed = value
        self._nonce = 0

    def spin(self, reel_symbol_counts: list[int]) -> SpinResult:
        """
        Execute one spin.

        Parameters
        ----------
        reel_symbol_counts : list[int]
            Number of distinct symbols on each reel, e.g. [10, 10, 10, 10, 10].

        Returns
        -------
        SpinResult
            Contains reel stops and all values needed for later verification.
        """
        raw_floats = derive_outcomes(
            self._server_seed,
            self._client_seed,
            self._nonce,
            count=len(reel_symbol_counts),
        )
        reel_stops = [
            int(f * n) for f, n in zip(raw_floats, reel_symbol_counts)
        ]
        result = SpinResult(
            server_seed_hash=self.server_seed_hash,
            client_seed=self._client_seed,
            nonce=self._nonce,
            raw_floats=raw_floats,
            reel_stops=reel_stops,
        )
        self._history.append(result)
        self._nonce += 1
        return result

    def reveal_server_seed(self) -> str:
        """
        Annotate all history entries with the current server seed so the
        player can verify past results.  Call before rotating seeds.
        """
        for entry in self._history:
            if not entry.server_seed:
                entry.server_seed = self._server_seed
        return self._server_seed

    def rotate_seeds(self) -> None:
        """
        Generate a new server seed and reset the nonce.  The old server seed
        must be revealed (via ``reveal_server_seed``) before calling this.
        """
        self._server_seed = _generate_seed()
        self._nonce = 0
        self._history = []

    # ------------------------------------------------------------------
    # Verification (can be run client-side)
    # ------------------------------------------------------------------

    @staticmethod
    def verify(result: SpinResult, reel_symbol_counts: list[int]) -> bool:
        """
        Independently verify a completed spin result.

        Returns True if the reel_stops match what the cryptographic proof
        produces for the given seeds and nonce.
        """
        # 1. Confirm the server seed matches its published hash
        computed_hash = hashlib.sha256(result.server_seed.encode()).hexdigest()
        if computed_hash != result.server_seed_hash:
            return False

        # 2. Recompute the outcomes from the revealed seed
        recomputed_floats = derive_outcomes(
            result.server_seed,
            result.client_seed,
            result.nonce,
            count=len(reel_symbol_counts),
        )
        recomputed_stops = [
            int(f * n) for f, n in zip(recomputed_floats, reel_symbol_counts)
        ]

        return recomputed_stops == result.reel_stops


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _generate_seed(byte_length: int = 32) -> str:
    """Return a cryptographically secure random hex seed."""
    return os.urandom(byte_length).hex()


# ---------------------------------------------------------------------------
# CLI demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    engine = ProvablyFairEngine()
    print(f"Server seed hash (commitment): {engine.server_seed_hash}")
    print(f"Client seed: {engine.client_seed}\n")

    reel_counts = [10, 10, 10, 10, 10]
    for i in range(3):
        result = engine.spin(reel_counts)
        print(f"Spin #{i + 1}: stops={result.reel_stops}  nonce={result.nonce}")

    revealed = engine.reveal_server_seed()
    print(f"\nRevealed server seed: {revealed}")

    for spin in engine._history:
        ok = ProvablyFairEngine.verify(spin, reel_counts)
        print(f"  Nonce {spin.nonce} verified: {ok}")
