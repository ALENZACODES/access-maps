# Attribution rights decision matrix

This local-only workbench records permission and licence evidence before a
published route incorporates source data. It is not a legal opinion and a
passing metadata gate does not grant permission or establish accessibility.

The `attribution-rights-matrix/1` contract includes explicit source and output
identifiers. Each source records its origin, licence and source-terms links,
acquisition and dataset dates, review date, evidence URL and tier, publication
state, redistribution permission, derivative-use permission, and source notice.
Each output records its included source IDs, publication route, display mode,
source notices, redistribution and share-alike evidence, offline status,
keyboard and screen-reader records, and minimum target size. Human exception
records identify a source/output pair and the evidence for resolving an issue.
Open exceptions block included outputs. A resolved exception does not override
a missing source permission or licence notice.

A source name cannot establish its rights. The audit distinguishes OSM map
credit from ODbL terms, Metrolinx AUA section 3 and applicable-laws notices
from the independent OGL notice, and LTC source acknowledgement. Other sources
must have an identifiable open licence as well as explicit permission. Data
with `UNKNOWN` dates stays `UNKNOWN`. A combined derivative involving ODbL
and another licence requires an explicit separation record; absence blocks.
There are no remote fetches or automated publication changes.

## Use

Serve the directory as static files and open `rights.html`. The page reads
user-selected JSON locally. It supports English and French, 44px controls,
keyboard focus, reduced-motion preferences and text/HTML/JSON reports. It
has a restrictive CSP and does not persist imported data.

Use the command line for a release gate:

```sh
node docs/attribution/rights-cli.mjs release.json --lang fr --format text
node docs/attribution/rights-cli.mjs release.json --before earlier.json --format json
node --test docs/attribution/rights-*.test.mjs
```

Status 0 means no blockers under the supplied metadata contract; 1 means the
current release or comparison has blocking findings; 2 indicates invalid
arguments or unreadable inputs. The command is read-only and has no scheduler.

`rights-index.mjs` is the barrel imported by the live browser route. It exports
the parser, audit, comparison and reports. Those modules import the merged
`attribution-utils.mjs` licence catalogue; it is not duplicated in this
package. The existing root test command already discovers `*.test.mjs` in
`docs/attribution/`. Static and automated checks do not substitute for manual
keyboard, touch or screen-reader assessment in the deployment environment.
