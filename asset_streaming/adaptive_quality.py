"""
Aerospin – Adaptive Streaming Quality Selector
===============================================
Adjusts the requested asset LOD (Level of Detail) based on real-time
network bandwidth and the fraction of screen the asset occupies.
"""


def select_lod(bandwidth_kbps: float, viewport_fraction: float) -> int:
    """
    Select an asset streaming LOD level.

    Parameters
    ----------
    bandwidth_kbps : float
        Measured downstream bandwidth in kbps (e.g. from a speed probe).
    viewport_fraction : float
        Fraction of the screen occupied by the asset (0.0 – 1.0).

    Returns
    -------
    int
        LOD level: 0 = full resolution … 3 = low-res proxy.
    """
    if bandwidth_kbps < 0 or viewport_fraction < 0 or viewport_fraction > 1:
        raise ValueError(
            "bandwidth_kbps must be >= 0 and viewport_fraction must be in [0, 1]"
        )

    if bandwidth_kbps >= 10_000 and viewport_fraction >= 0.25:
        return 0  # Full resolution – high bandwidth + prominent on screen
    if bandwidth_kbps >= 3_000 or viewport_fraction >= 0.10:
        return 1  # High quality
    if bandwidth_kbps >= 1_000:
        return 2  # Medium quality
    return 3      # Proxy only – slow connection or asset barely visible


if __name__ == "__main__":
    examples = [
        (15_000, 0.50),
        (5_000,  0.20),
        (2_000,  0.05),
        (500,    0.01),
    ]
    for bw, vp in examples:
        print(f"  bandwidth={bw:>6} kbps, viewport={vp:.0%} → LOD {select_lod(bw, vp)}")
