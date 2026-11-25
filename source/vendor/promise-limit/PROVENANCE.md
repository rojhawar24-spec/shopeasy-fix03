# First-party task limiter

VERIFIED — This small FIFO implementation was newly written for the R27 cleanup on 13 November 2026. It replaces the runtime interface used from `promise-limit@2.7.0`; it contains no imported source from that package. Its own implementation and behavioral regressions are in this release.

VERIFIED — npm installs this local component under the dependency name `promise-limit` through an explicit root dependency/override. Its actual package identity is `@shopeasy/task-limit@1.0.0`. It is not the npm registry's `promise-limit` release and must not be attributed to that upstream author or described as ISC-licensed third-party code.

UNKNOWN — Effective first-party commercial grant and chain of title for the whole product. This component follows the root draft product grant (`UNLICENSED` metadata); this file does not itself execute a sale/assignment or assert legal clearance.

NOT TESTED — Every possible external consumer API. The supported compatibility surface is the callable factory/limiter used by the locked `@libsql/client`: bounded concurrent tasks, FIFO admission, value/error propagation and slot release. The optional read-only `queue` count is also covered. No upstream `map` extension is required by the inspected client.
