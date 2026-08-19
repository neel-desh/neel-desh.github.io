---
title: "Shipped a high-throughput candles API with multi-layer caching"
kind: built
date: 2023-03-01
org: Punch
summary: "Candles API serving 4-5M requests/day, with multi-layer caching to keep read latency flat under load."
metrics:
  - label: "Throughput"
    value: "4-5M requests/day"
stack: ["Elixir", "Redis", "PostgreSQL", "TimescaleDB"]
project: "market-data-capture-replay"
visibility: public
---

Multi-layer caching so repeated range queries never reach the database, and
the hot path stays flat as request volume grows.
