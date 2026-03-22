#!/usr/bin/env node
/**
 * Apple Music Playlist Downloader
 *
 * Usage:
 *   node download.js <playlist_url> [options]
 *
 * Options:
 *   --source youtube   Download from YouTube (default, requires access to YouTube)
 *   --source bilibili  Download from Bilibili (works in China)
 *   --output <dir>     Output directory (default: ./songs)
 *
 * Examples:
 *   node download.js https://music.apple.com/us/playlist/swim/pl.u-xxx
 *   node download.js https://music.apple.com/us/playlist/swim/pl.u-xxx --source bilibili
 *   node download.js https://music.apple.com/us/playlist/swim/pl.u-xxx --output ~/Desktop/songs
 */

const https = require("https");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");

const execFileAsync = util.promisify(execFile);
const ytdlpBin = path.resolve(__dirname, "node_modules/youtube-dl-exec/bin/yt-dlp");

// ── Parse CLI arguments ───────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { url: null, source: "youtube", output: "./songs" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source") result.source = args[++i];
    else if (args[i] === "--output") result.output = args[++i];
    else if (!args[i].startsWith("--")) result.url = args[i];
  }
  return result;
}

// ── 1. Fetch and parse Apple Music playlist ───────────────────────────────────

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parsePlaylist(html) {
  const nameMatch = html.match(/"name":"([^"]+)","kind":"playlist"/);
  const playlistName = nameMatch ? nameMatch[1] : "playlist";

  // Extract songs by pairing each artistName with the nearest following name field
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

// ── 2. Search and download ────────────────────────────────────────────────────

function sanitize(str) {
  return str.replace(/[/\\?%*:|"<>]/g, "-");
}

async function downloadFromYouTube(song, outputPath) {
  const yts = require("yt-search");
  const r = await yts(`${song.name} ${song.artist}`);
  if (!r.all || r.all.length === 0) throw new Error("No results on YouTube");
  const videoUrl = r.all[0].url;
  console.log("  -> YouTube:", videoUrl);
  await execFileAsync(ytdlpBin, [
    "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0",
    "--no-update", "-o", outputPath, videoUrl,
  ]);
}

async function downloadFromBilibili(song, outputPath) {
  // Use yt-dlp's built-in bilisearch extractor
  const query = `bilisearch1:${song.name} ${song.artist}`;
  console.log("  -> Bilibili search:", `${song.name} ${song.artist}`);
  await execFileAsync(ytdlpBin, [
    "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0",
    "--no-update", "-o", outputPath, query,
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { url: playlistUrl, source, output: outputDir } = parseArgs();

  if (!playlistUrl) {
    console.log("Usage: node download.js <apple_music_playlist_url> [--source youtube|bilibili] [--output <dir>]");
    process.exit(1);
  }

  console.log(`Source: ${source === "bilibili" ? "Bilibili (China-friendly)" : "YouTube"}`);
  console.log("Fetching playlist:", playlistUrl);

  const html = await fetchPage(playlistUrl);
  const { playlistName, songs } = parsePlaylist(html);

  if (songs.length === 0) {
    console.error("No songs found. Make sure the playlist is public.");
    process.exit(1);
  }

  const resolvedOutput = path.resolve(outputDir);
  console.log(`Playlist: ${playlistName}`);
  console.log(`Total: ${songs.length} songs`);
  console.log(`Output: ${resolvedOutput}\n`);

  if (!fs.existsSync(resolvedOutput)) fs.mkdirSync(resolvedOutput, { recursive: true });

  let downloaded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const prefix = `(${i + 1}/${songs.length})`;
    const safeTitle = sanitize(`${song.name} - ${song.artist}`);
    const outputPath = path.join(resolvedOutput, safeTitle + ".mp3");

    if (fs.existsSync(outputPath)) {
      console.log(`${prefix} [SKIP] ${song.name} - ${song.artist}`);
      skipped++;
      continue;
    }

    console.log(`${prefix} Downloading: ${song.name} - ${song.artist}`);

    try {
      if (source === "bilibili") {
        await downloadFromBilibili(song, outputPath);
      } else {
        await downloadFromYouTube(song, outputPath);
      }
      console.log(`${prefix} [DONE] ${safeTitle}.mp3`);
      downloaded++;
    } catch (err) {
      console.log(`${prefix} [ERROR] ${song.name}: ${err.stderr || err.message}`);
      failed++;
    }
  }

  console.log(`\n====== Finished ======`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped:    ${skipped} (already exist)`);
  console.log(`Failed:     ${failed}`);
  console.log(`Location:   ${resolvedOutput}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
