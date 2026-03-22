#!/usr/bin/env node
/**
 * Sync songs/ folder to Shokz earphone
 * Usage: node sync.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SONGS_DIR = path.resolve(__dirname, "songs");
const DEVICE_PATTERN = /shokz|openswim|bone|swim pro|swim/i;

const volumes = fs.readdirSync("/Volumes");
const vol = volumes.find((v) => DEVICE_PATTERN.test(v));

if (!vol) {
  console.log("Shokz earphone not detected. Please make sure it is plugged in.");
  console.log("Volumes currently mounted:", volumes.join(", ") || "(none)");
  process.exit(1);
}

const dest = `/Volumes/${vol}/`;
console.log(`Syncing: ${SONGS_DIR}`);
console.log(`    to:  ${dest}`);

execSync(
  `rsync -av --exclude='.DS_Store' "${SONGS_DIR}/" "${dest}"`,
  { stdio: "inherit" }
);

console.log("\nSync complete ✓");
