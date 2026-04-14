"""
Aerospin – Graphics Pipeline Bootstrap
=======================================
Runtime C#-equivalent logic expressed as pseudocode / documented Python.

The actual MonoBehaviour lives in Unity C#; this file documents the device-
capability detection algorithm so it can be ported or reviewed independently.

Decision tree
-------------
1.  Query SystemInfo.supportsRayTracing  (Unity 2023 LTS+, Vulkan 1.1+)
2.  Query GPU tier via Graphics.activeTier
3.  Select the matching URP pipeline asset from Resources/
4.  Optionally enable FSR 2 upscaling when render scale < 1
"""

from dataclasses import dataclass, replace
from enum import Enum


class GPUTier(Enum):
    LOW = 0
    MEDIUM = 1
    HIGH = 2


@dataclass
class PipelineProfile:
    name: str
    render_scale: float
    msaa: int
    ray_tracing: bool
    rtgi: bool
    ssgi: bool
    shadow_distance: float
    shadow_cascades: int
    additional_lights: int
    fsr_enabled: bool
    fsr_sharpness: float


# Profiles keyed by GPU tier ------------------------------------------------
PROFILES: dict[GPUTier, PipelineProfile] = {
    GPUTier.HIGH: PipelineProfile(
        name="Aerospin_High",
        render_scale=1.0,
        msaa=4,
        ray_tracing=True,
        rtgi=True,
        ssgi=True,
        shadow_distance=50.0,
        shadow_cascades=3,
        additional_lights=8,
        fsr_enabled=False,
        fsr_sharpness=0.85,
    ),
    GPUTier.MEDIUM: PipelineProfile(
        name="Aerospin_Medium",
        render_scale=0.77,   # FSR 2 "Quality" mode
        msaa=2,
        ray_tracing=False,
        rtgi=False,
        ssgi=True,
        shadow_distance=30.0,
        shadow_cascades=2,
        additional_lights=4,
        fsr_enabled=True,
        fsr_sharpness=0.75,
    ),
    GPUTier.LOW: PipelineProfile(
        name="Aerospin_Low",
        render_scale=0.59,   # FSR 2 "Performance" mode
        msaa=0,
        ray_tracing=False,
        rtgi=False,
        ssgi=False,
        shadow_distance=15.0,
        shadow_cascades=1,
        additional_lights=2,
        fsr_enabled=True,
        fsr_sharpness=0.60,
    ),
}


def select_pipeline_profile(
    supports_ray_tracing: bool,
    gpu_tier: GPUTier,
    thermal_state: int,         # 0=Nominal 1=Fair 2=Serious 3=Critical
) -> PipelineProfile:
    """
    Choose the best graphics profile for the current device state.

    Parameters
    ----------
    supports_ray_tracing : bool
        SystemInfo.supportsRayTracing from Unity (Vulkan Ray Query path).
    gpu_tier : GPUTier
        Derived from Graphics.activeTier or a benchmark score.
    thermal_state : int
        iOS/Android thermal API value; throttle quality when device is hot.
    """
    profile = PROFILES[gpu_tier]

    # Thermal throttling: step down one quality tier when device is warm
    if thermal_state >= 2 and gpu_tier != GPUTier.LOW:
        lower_tier = GPUTier(gpu_tier.value - 1)
        profile = PROFILES[lower_tier]

    # Work on a copy so the shared PROFILES dict is never mutated
    profile = replace(profile)

    # Ray tracing requires both hardware support AND the high-tier profile
    if not supports_ray_tracing:
        profile = replace(profile, ray_tracing=False, rtgi=False)

    return profile


# ---------------------------------------------------------------------------
# Usage example (would be called from Unity C# via Python.NET or documented
# for a C# port):
if __name__ == "__main__":
    profile = select_pipeline_profile(
        supports_ray_tracing=True,
        gpu_tier=GPUTier.HIGH,
        thermal_state=0,
    )
    print(f"Selected profile: {profile}")
