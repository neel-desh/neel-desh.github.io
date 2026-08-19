---
title: "Designed Aegis, a centralized SSO library"
kind: built
date: 2023-04-01
org: Punch
summary: "In-house SSO library adopted across 8 microservices, replacing fragmented per-service auth."
metrics:
  - label: "Adoption"
    value: "8 microservices"
stack: ["Auth", "OAuth", "Elixir", "Security"]
project: "aegis-sso"
visibility: public
---

Every service had grown its own auth. Aegis centralized it on Google OAuth
with near-instant session revocation, and was later extended to gate VPN
access.
