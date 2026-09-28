# ADR-0011: Çekirdek dil TypeScript

## Durum

Kabul edildi.

## Bağlam

Kernel, CLI, daemon, control API, MCP ve adapter'ların ayrı dillerde başlaması sözleşme maliyetini ilk günden taşır. Performans ihtiyacı bu fazda yoktur.

## Karar

Çekirdek stack TypeScript ve Node.js'tir. Monorepo pnpm workspace ve Turborepo kullanır.

İleride execution daemon Go veya Rust'a ayrılırsa, ayrım `RuntimeAdapter` ve daemon protokolünden yapılır. Domain tipleri o dile kopyalanarak kaçırılmaz; protokol sınırı korunur.

## Sonuç

Bu fazda Go veya Rust modülü yoktur.
