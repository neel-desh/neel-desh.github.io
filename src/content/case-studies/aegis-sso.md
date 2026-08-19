---
title: "Aegis SSO Library"
summary: "In-house SSO library adopted across 8 microservices, replacing fragmented per-service auth with centralized Google-OAuth sign-in."
date: 2023-04-01
org: Punch
role: "Backend engineer"
stack: ["Auth", "OAuth", "Elixir", "Security", "Microservices"]
problem: "Eight microservices had each grown their own authentication. Session revocation meant touching every one of them, which in practice meant revocation was slow and inconsistent - the gap between 'we revoked access' and 'access actually stopped working' was measured in whatever the slowest service did."
outcome: "Centralized Google-OAuth sign-in across 8 microservices with near-instant session revocation, later extended to gate VPN access."
order: 3
visibility: public
---

## Architecture

A shared library rather than an auth service in the request path — services
verify locally against centralized session state, so sign-in is centralized
without adding a network hop that every request has to survive.

Revocation is the feature that justified the project. Centralizing session
state is what makes "revoke this session" take effect near-instantly across all
eight services instead of propagating at each service's own pace.

Once the primitive existed, extending it to gate VPN access was mostly
configuration.

## Tradeoffs

A library means version drift: eight services can be running eight versions,
and a security fix is only real once they have all upgraded. A central auth
service would avoid that, at the cost of putting a network dependency in front
of every authenticated request.

For this system the library won, because the request-path cost is paid
constantly and the upgrade cost is paid occasionally.
