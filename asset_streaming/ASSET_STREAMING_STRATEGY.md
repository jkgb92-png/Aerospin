# Aerospin – Dynamic Asset Streaming Strategy
## High-Resolution 3D Asset Delivery for Mobile (AAA Quality)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Aerospin Client                    │
│  Unity Addressables ──► Local LRU Cache (512 MB)     │
│       ▲                                              │
│       │  HTTPS/CDN                                   │
└───────┼──────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────┐
│            CloudFront (AWS) / Cloud CDN (GCP)        │
│  Edge POP closest to player – p99 <30 ms             │
└───────┬──────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────┐
│               Origin Storage                         │
│  AWS S3  or  Google Cloud Storage                    │
│  Bucket layout (see below)                           │
└──────────────────────────────────────────────────────┘
```

---

## 1. Asset Preparation Pipeline

### Compression targets

| Asset type | Tool | Format | Target size |
|------------|------|---------|-------------|
| Textures | Basis Universal | `.ktx2` (Basis-LZ / ASTC fallback) | 4× smaller than PNG |
| Meshes | Draco | `.draco.glb` | 70–90% size reduction |
| Audio | Opus | `.opus` | 64 kbps stereo |
| Animations | ACL (Animation Compression Library) | `.acl.bin` | 3–4× vs. raw curves |
| Environment maps | ETC2 / ASTC (adaptive) | `.ktx2` | Per mip-level compression |

### Mip-streaming levels

```
LOD0 – Full resolution (only downloaded when asset is on-screen at >25% viewport)
LOD1 – 50% resolution  (on-screen <25% viewport or distance >10 m)
LOD2 – 25% resolution  (loading placeholder / preview)
LOD3 – 128×128 blurred proxy (always cached on device, instant display)
```

---

## 2. Bucket Layout (S3 / GCS)

```
aerospin-assets/
  catalog/
    catalog_{version}.json        # Addressables remote catalog
    catalog_{version}.hash        # Hash file for incremental updates
  bundles/
    shared/                       # Common assets across all worlds
    world_classic/                # Multiverse world: Las Vegas Classic
    world_neon/                   # Multiverse world: Neon Cyber
    world_crystal/                # Multiverse world: Crystal Realm
    world_volcanic/               # Multiverse world: Volcanic Forge
  audio/
    music/
    sfx/
```

---

## 3. AWS CloudFront Configuration

```json
{
  "Origins": [{
    "DomainName": "aerospin-assets.s3.amazonaws.com",
    "S3OriginConfig": { "OriginAccessIdentity": "origin-access-identity/cloudfront/AEROSPIN_OAI" }
  }],
  "DefaultCacheBehavior": {
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"]
  },
  "CacheBehaviors": [{
    "PathPattern": "bundles/*",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "TTL": { "DefaultTTL": 86400, "MaxTTL": 31536000 }
  }, {
    "PathPattern": "catalog/*",
    "TTL": { "DefaultTTL": 60, "MaxTTL": 300 }
  }],
  "PriceClass": "PriceClass_All",
  "HttpVersion": "http2and3"
}
```

---

## 4. Unity Addressables Configuration

```csharp
// AerospinAddressablesConfig.cs  (attach to a bootstrap GameObject)
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public static class AerospinAddressables
{
    private const string RemoteCatalogUrl =
        "https://d1234abcdef.cloudfront.net/catalog/catalog_{0}.json";

    /// <summary>
    /// Initialise Addressables and load the remote catalog.
    /// Call once at app startup before entering the lobby.
    /// </summary>
    public static async Awaitable InitializeAsync()
    {
        // Override the remote catalog URL with the current app version
        string version = Application.version.Replace(".", "_");
        Addressables.InternalIdTransformFunc = id =>
            id.Replace("{RemoteCatalogVersion}", version);

        var init = Addressables.InitializeAsync();
        await init.Task;

        if (init.Status == AsyncOperationStatus.Failed)
            throw new System.Exception("Addressables init failed: " + init.OperationException);
    }

    /// <summary>
    /// Preload a Multiverse world bundle in the background while the player
    /// is in the lobby.  Progress 0–1 can drive a loading bar.
    /// </summary>
    public static AsyncOperationHandle<long> GetWorldDownloadSize(string worldLabel)
        => Addressables.GetDownloadSizeAsync(worldLabel);

    public static AsyncOperationHandle DownloadWorldAsync(string worldLabel)
        => Addressables.DownloadDependenciesAsync(worldLabel, true);
}
```

---

## 5. LRU Cache Policy (on-device)

```
Total on-device cache budget:  512 MB  (configurable in settings)
  ├── Shared assets:            128 MB  (never evicted)
  ├── Active world:             256 MB  (evicted when world changes)
  └── LRU overflow buffer:      128 MB  (evicted oldest-first on pressure)

Eviction trigger:
  - Free device storage < 200 MB  → clear overflow buffer
  - Free device storage < 100 MB  → also clear active world cache
```

---

## 6. Adaptive Streaming Quality

```python
# asset_streaming/adaptive_quality.py
# Adjusts requested LOD based on measured network bandwidth

def select_lod(bandwidth_kbps: float, viewport_fraction: float) -> int:
    """
    Select streaming LOD level (0=highest … 3=lowest).

    Parameters
    ----------
    bandwidth_kbps : float   Measured downstream bandwidth in kbps.
    viewport_fraction : float  Fraction of screen the asset occupies (0–1).
    """
    if bandwidth_kbps >= 10_000 and viewport_fraction >= 0.25:
        return 0   # Full res
    elif bandwidth_kbps >= 3_000 or viewport_fraction >= 0.10:
        return 1
    elif bandwidth_kbps >= 1_000:
        return 2
    else:
        return 3   # Proxy only
```

---

## 7. Security

- All assets served over **HTTPS only** (CloudFront enforces redirect).
- S3 bucket is **private**; assets accessible only via signed CloudFront URLs.
- Signed URL expiry: **1 hour** (refreshed automatically by the game client).
- Asset bundles are **content-hash named** (no predictable URLs).
