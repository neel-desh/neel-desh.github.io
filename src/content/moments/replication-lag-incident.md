---
title: "Stopped a runaway replication-lag incident with zero data loss"
kind: operated
date: 2023-09-01
org: Punch
summary: "Diagnosed and resolved a runaway replication-lag incident solo, in about two hours, with no data loss."
metrics:
  - label: "Resolution time"
    value: "~2 hours"
  - label: "Data loss"
    value: "Zero"
stack: ["PostgreSQL", "Linux", "Prometheus"]
visibility: public
---

Replication lag was growing without bound. Resolved in roughly two hours
with no data loss.
