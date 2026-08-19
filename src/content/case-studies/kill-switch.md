---
title: "Kill-Switch Risk Control System"
summary: "Elixir/OTP system that atomically cancels all pending orders and squares off intraday positions across Equity & F&O on trigger."
date: 2022-12-01
org: Punch
role: "Backend engineer"
stack: ["Elixir", "OTP", "Redis", "Risk Systems", "Fault Tolerance"]
problem: "Risk needed a single control that could stop everything at once - cancel every pending order and square off intraday positions across both Equity and F&O. Doing this partially is worse than not doing it: a half-executed kill leaves positions open with orders cancelled."
outcome: "Atomic kill across Equity & F&O, with a fail-open guard ensuring a cache outage can never block live trading."
order: 2
visibility: public
---

## Architecture

Built on OTP supervision, which is most of why Elixir was the right choice: the
kill path needs to survive the failure of individual components without the
overall guarantee degrading.

The trigger fans out to cancel pending orders and square off intraday positions
across both segments, and either the whole action lands or it is retried — a
partial kill is the failure mode that actually hurts.

## Tradeoffs

The important decision was which way to fail. A risk control that blocks trading
when its own cache is unavailable converts a dependency outage into a trading
outage, which is a strictly worse incident than the one it protects against. So
the guard fails open: if the cache is down, trading continues.

That is an uncomfortable property to write down, and it is the right one. The
kill switch exists to bound a specific risk, not to become a new single point of
failure in front of the entire trading path.
