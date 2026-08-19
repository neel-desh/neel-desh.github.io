---
title: "Replaced third-party search API with a custom Go engine"
kind: solved
date: 2024-02-01
org: Punch
summary: "Built an in-house search engine in Go, cutting p99 search latency from 150-250ms to around 90ms and removing a third-party dependency."
metrics:
  - label: "p99 latency"
    value: "150-250ms to ~90ms"
stack: ["Go", "Search"]
visibility: public
---

The third-party search API was both a latency floor and an external
dependency on a critical path. Replacing it with an in-house Go engine cut
p99 to roughly 90ms and brought the whole path back in-house.
