---
title: "Mouseless Development with Neovim Tmux & Aerospace"
date: 2025-10-27
slug: "my-development-setup"
description: "this is my workflow of writing code and being fast at it!"
keywords: ["nvim", "tmux", "vim", "mouseless", "aerospace", "kanata"]
draft: false
tags: ["development", "neovim", "tmux", "mouseless", "aerospace", "kanata"]
summary: This is my day to day developement setup, that speeds up my development.
---


## Let's dive into my development workflow

I use macbook pro M3 as my daily driver, but all the setup shown here should be easily replicated to linux or windows.

## Idealogy

The idea here here to have very less context switching, to press very few keystrokes, use keyboard instead of mouse/trackpad, focus on homerows & just let default mode take over.


## Tools

Here are the tools that will enable us to acheive this!

1) Aerospace - Tiling window manager, that will help us switch to different applications or so called spaces with just a simple keystroke. (it is an i3 alternative) 
2) Kanata - Im using kanata for homerow mods. basically to when i press & hold a itll press cmd. this is for my finger to be relaxed.
3) Neoivm - Yeah! you know it.
4) Tmux - a session multiplexer - helps you mange multiple terminall session into a single session.
5) mouseless.app - a tool that enables using keyboard to click on screen instead of dragging mouse and then clicking! (The usage is very limited! But I like using this) 

## The Setup

### Install Aerospace

We would be installing  [aerospace](https://github.com/nikitabobko/AeroSpace)  using brew.

```
brew install --cask nikitabobko/tap/aerospace
```

once done, you can open the aerospace using spotlight or from the apps menu.

Aerospace usually refers to `aerospace-config.yml` in the home directory.

So in Aerospace, you can define what application to open in what window. it gives you virtual spaces!

My setup is all browsers in 1st Space, Terminals and Editors in 2nd Space, Slack/Discord in 3rd space, all other in 4th Space.


