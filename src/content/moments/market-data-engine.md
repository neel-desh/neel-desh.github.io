---
title: "Built a market-data capture & replay engine"
kind: built
date: 2022-11-01
org: Punch
summary: "Go engine ingesting 20K+ ticks/sec over NATS JetStream, reconstructing live-market timing to microsecond precision."
metrics:
  - label: "Ingest rate"
    value: "20K+ ticks/sec"
  - label: "Replay fidelity"
    value: "Microsecond precision"
stack: ["Go", "NATS", "Market Data", "Real-time Systems"]
project: "market-data-capture-replay"
visibility: public
---

Capturing the tick stream is the easy half. Replaying it with the original
inter-tick timing intact — so strategies backtest against something that
behaves like the live market — is what made this worth building.
