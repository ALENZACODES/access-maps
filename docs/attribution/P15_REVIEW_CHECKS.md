# Offline review delivery checks

The base is merged `access-maps` main at `ad3aaf21993f8df3639654504e646996abc89680`. The ZIP contains the review tools, tests, complete integration files and the local dependencies they import. Its paths begin with `access-maps/`. The custody move map identifies fourteen source paths retired on this base.

## Scope and line counts

Counts cover lines containing source or test code, including test fixtures and type declarations. Blank lines and comment-only lines are excluded. The route-evidence and reconciliation repairs, package configuration, user guides and previously merged transitive dependencies outside these groups are excluded from the total.

| Group | Production | Tests and fixtures | Total |
|---|---:|---:|---:|
| Evidence custody | 679 | 1,654 | 2,333 |
| Retention and disposition | 631 | 1,427 | 2,058 |
| Exceptions and appeals | 380 | 1,641 | 2,021 |
| Source revalidation and impact | 814 | 942 | 1,756 |
| Offline review queue and handoff | 978 | 874 | 1,852 |
| Custody-to-queue integration | 128 | 212 | 340 |
| **Total** | **3,610** | **6,750** | **10,360** |

## Repository and browser checks

| Check | Result |
|---|---|
| Maps root lint and strict TypeScript, workspace lint and E2E strict TypeScript | Passed. The dedicated source-review project also checks the queue, integration and annotated JavaScript with strict indexing enabled. |
| Static JavaScript checks | The lane modules and tests passed checks for unresolved names, unused variables, unreachable code, duplicate declarations and duplicate keys. |
| Maps root tests | 14,052 passed across the native Node and Vitest runners, including 1,126 custody, retention, appeal, revalidation, queue and cross-module tests. |
| Additional suites outside root test discovery | Reconciliation 556 passed, publication gates 325 passed and places shell 13 passed. |
| Chromium journey and outage tests | 15 passed with one worker and zero test-runner retries. |
| Chromium map audit and offline reconciliation | 8 passed. Audit coverage includes English and French. The reconciliation flow was checked offline at widths of 320, 390 and 1,280 CSS pixels. |
| Accessibility | Zero axe violations in the audited scenarios. Browser assertions cover keyboard focus, accessible names, live status and 44 × 44 CSS pixel controls. |
| Schema, sample and strict data checks | Passed. The strict data check inspected 2,296,708 records across 4,768 files and reported zero violations. |
| Current source registry | The French summary processed 181 local source rows and retained the exact credit `© OpenStreetMap contributors`. |

The P15J workflow runs its four Vitest suites. The reconciliation workflow runs its Node specs on pull requests. The route-leg test expands the comparison panel and checks the outbound and return leg lists against the planned journey in both languages. The test asserts each leg’s status and source and the wording shown for unknown evidence.

One Chromium process crashed during a concurrent run. The full 15-test browser run then passed in isolation with the same timeout and assertions. The Node 22 offline CLI tests ran with the host’s experimental network proxy option disabled so that the runtime's proxy warning did not precede command diagnostics on standard error.

## Consumer budgets

The consumer was `access-main` main at `4f558d3613fb70c642d40f9338648eb5117e8eb6`. The build used the candidate maps packages, together with the consumer’s pinned help and tools packages. Both checks used the existing 4,141,875-byte cap.

| Measured output | Bytes | Files | Headroom |
|---|---:|---:|---:|
| First install | 4,077,559 | 115 | 64,316 |
| Service-worker precache | 4,047,435 | 113 | 94,440 |

The largest precached JavaScript entry was 314,934 bytes against its 524,288-byte limit.

## PR state

The latest Actions runs on the checked heads of #104 (`da3ac014`), #120 (`70792b3a`), #122 (`7f707d98`) and #123 (`8d5533b9`) succeeded. A local merge-tree check against the base found zero conflicting paths on those four heads. The package carries the requested route and offline-gate changes rebuilt on main. The remote branches were only read.
