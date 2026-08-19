---
title: "Delivered a fail-safe kill switch for live trading"
kind: built
date: 2022-12-01
org: Punch
summary: "Elixir/OTP system that atomically cancels pending orders and squares off intraday positions across Equity & F&O, with a fail-open guard."
metrics:
  - label: "Coverage"
    value: "Equity & F&O"
stack: ["Elixir", "OTP", "Risk Systems", "Fault Tolerance"]
project: "kill-switch"
visibility: public
---

The interesting constraint was the failure mode. A risk control that blocks
trading when its own cache is down is worse than no risk control, so the
guard fails open — a cache outage can never wedge live trading.
