#!/bin/sh
# SuuntoProtokoll.swift (iOS) auf Linux bauen und gegen die Testvektoren laufen lassen.
# Braucht die Swift-Linux-Toolchain (~/swift-6.1). Zwischendateien in einem eigenen Ordner.
set -e
cd "$(dirname "$0")"
R=../../..
T="${TMPDIR:-/tmp}/suunto-swift-$$"; mkdir -p "$T"
TMPDIR="$T" "${SWIFTC:-$HOME/swift-6.1/usr/bin/swiftc}" -O -o "$T/pruefen" \
  "$R/watch-apple/Sources-iOS/SuuntoProtokoll.swift" main.swift
"$T/pruefen" "$R/android/app/src/test/resources/suunto/pakete.json" "$T" "$R/watch-suunto/test/fixtures/suunto-e2e-dateien.json"
rm -rf "$T"
