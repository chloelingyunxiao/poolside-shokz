#!/usr/bin/env node
/**
 * Apple Music Playlist Downloader
 * Usage: node download.js <playlist_url> [output_dir]
 * Example: node download.js https://music.apple.com/us/playlist/swim/pl.u-PDb40oVue8DlLM9
 */

const https = require("https");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");
const yts = require("yt-search");

const execFileAsync = util.promisify(execFile);
const ytdlpBin = path.resolve(__dirname, "node_modules/youtube-dl-exec/bin/yt-dlp");

// ── 1. Fetch Apple Music playlist page ──────────────────────────────────────

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    };
    https
      .get(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parsePlaylist(html) {
  // Extract playlist name
  const nameMatch = html.match(/"name":"([^"]+)","kind":"playlist"/);
  const playlistName = nameMatch ? nameMatch[1] : "playlist";

  // Extract songs (find name after artistName, deduplicate)
  const pattern = /"artistName":"([^"]+)".*?"name":"([^"]+)"/gs;
  const seen = new Set();
  const songs = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const key = `${m[1]}|${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      songs.push({ artist: m[1], name: m[2] });
    }
  }
  return { playlistName, songs };
}

// ── 2. Search YouTube ────────────────────────────────────────────────────────

async function searchYouTube(songName, artist) {
  const r = await yts(`${songName} ${artist}`);
  if (!r.all || r.all.length === 0) return null;
  return r.all[0].url;
}

// ── 3. Download as MP3 ───────────────────────────────────────────────────────

function sanitize(str) {
  return str.replace(/[/\\?%*:|"<>]/g, "-");
}

async function downloadMp3(videoUrl, outputPath) {
  await execFileAsync(ytdlpBin, [
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--no-update",
    "-o", outputPath,
    videoUrl,
  ]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const playlistUrl = process.argv[2];
  const outputDir = path.resolve(process.argv[3] || "./songs");

  if (!playlistUrl) {
    console.error("Usage: node download.js <apple_music_playlist_url> [output_dir]");
    process.exit(1);
  }

  console.log("Fetching playlist:", playlistUrl);
  const html = await fetchPage(playlistUrl);
  const { playlistName, songs } = parsePlaylist(html);

  if (songs.length === 0) {
    console.error("No songs found. Make sure the playlist is public.");
    process.exit(1);
  }

  console.log(`Playlist: ${playlistName}`);
  console.log(`Total songs: ${songs.length}\n`);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  let downloaded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < songs.length; i++) {
    const { name, artist } = songs[i];
    const prefix = `(${i + 1}/${songs.length})`;
    const safeTitle = sanitize(`${name} - ${artist}`);
    const outputPath = path.join(outputDir, safeTitle + ".mp3");

    if (fs.existsSync(outputPath)) {
      console.log(`${prefix} [SKIP] ${name} - ${artist}`);
      skipped++;
      continue;
    }

    console.log(`${prefix} Searching: ${name} - ${artist}`);
    const videoUrl = await searchYouTube(name, artist);

    if (!videoUrl) {
      console.log(`${prefix} [NOT FOUND] ${name} - ${artist}`);
      failed++;
      continue;
    }

    try {
      await downloadMp3(videoUrl, outputPath);
      console.log(`${prefix} [DONE] ${safeTitle}.mp3`);
      downloaded++;
    } catch (err) {
      console.log(`${prefix} [ERROR] ${name}: ${err.stderr || err.message}`);
      failed++;
    }
  }

  console.log(`\n====== Done ======`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped:    ${skipped}`);
  console.log(`Failed:     ${failed}`);
  console.log(`Saved to:   ${outputDir}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
