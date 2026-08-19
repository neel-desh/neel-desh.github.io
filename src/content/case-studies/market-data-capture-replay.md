---
title: "Market-Data Capture & Replay Engine"
summary: "Go engine ingesting 20K+ ticks/sec over NATS JetStream, reconstructing live-market timing to microsecond precision."
date: 2022-11-01
org: Punch
role: "Backend engineer"
stack: ["Go", "NATS JetStream", "TimescaleDB", "Market Data", "Real-time Systems"]
problem: "Backtests were running against data that had lost its original timing. Ticks were stored in order, but the gaps between them - the part that actually determines whether a strategy fills - were gone. Strategies that looked profitable in a backtest behaved differently against the live feed."
outcome: "20K+ ticks/sec sustained ingest with replay accurate to microsecond inter-tick timing, and a candles API on top of it serving 4-5M requests/day."
order: 1
visibility: public
---

## Architecture

Ticks arrive over NATS JetStream and are written to a durable log before any
processing. Capture and processing are deliberately separate: the capture path
does as little as possible, because anything it does is work that can fall
behind a live market.

Replay reads that log back and reconstructs the original inter-tick gaps rather
than streaming as fast as it can read. That is the whole point of the system —
ordering alone is not enough to make a backtest resemble the live feed.

Candles are generated in TimescaleDB via continuous aggregates rather than in
the application layer, which is what took CPU down by more than 70% when it
was migrated.

## Tradeoffs

Storing the raw tick stream durably before processing costs disk, and a lot of
it. The alternative — aggregating on the way in — is cheaper and permanently
lossy: you cannot recover a timing question you did not know you would want to
ask. For market data, the disk is worth it.
