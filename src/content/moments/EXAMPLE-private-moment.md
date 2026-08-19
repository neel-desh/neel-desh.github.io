---
title: "Example private moment"
kind: built
date: 2026-01-01
summary: "This moment is marked private. It must never render and must never reach the chat corpus. The build test asserts exactly that."
stack: ["Nothing"]
visibility: private
---

If this sentence ever appears in dist/ or in the published corpus, the
visibility gate has regressed. GOLDENCANARY-DO-NOT-SHIP is the string the
build test greps for.
