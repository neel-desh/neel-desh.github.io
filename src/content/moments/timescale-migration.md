---
title: "Migrated candle generation to TimescaleDB, cutting CPU 70%+"
kind: scaled
date: 2023-06-01
org: Punch
summary: "Moved candle generation off application-side aggregation onto TimescaleDB, cutting CPU by more than 70%."
metrics:
  - label: "CPU reduction"
    value: "70%+"
stack: ["TimescaleDB", "PostgreSQL", "Elixir"]
project: "market-data-capture-replay"
visibility: public
---

Candle generation was being computed in the application layer. Pushing the
aggregation down into TimescaleDB's continuous aggregates removed the
recomputation entirely and took CPU down by over 70%.
