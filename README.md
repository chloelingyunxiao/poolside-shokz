# Apple Music to MP3 + Shokz Sync

Download songs from a public Apple Music playlist as MP3 files, then sync them to your Shokz earphone.

## Requirements

- Node.js
- `ffmpeg` (for audio conversion) — install via `brew install ffmpeg`
- Dependencies: run `npm install` once before first use

## Usage

### 1. Download a playlist

```bash
node download.js <apple_music_playlist_url>
```

Songs are saved to `./songs/` as MP3 files. Already-downloaded songs are skipped automatically.

### 2. Sync to Shokz earphone

Plug in your Shokz earphone via USB, then run:

```bash
node sync.js
```

This copies all songs from `./songs/` to the earphone. Existing files on the earphone are kept — only new songs are added.

## How it works

1. `download.js` fetches the playlist page from Apple Music, extracts track metadata, searches YouTube for each song, and downloads the audio as MP3 using yt-dlp + ffmpeg.
2. `sync.js` detects the Shokz earphone mount point under `/Volumes/` and runs `rsync` to copy new files over.

## Notes

- Playlist must be **public** to be accessible without login.
- There is a small chance (~5%) that a different version of a song (remix, cover) gets downloaded due to YouTube search matching.
- If `sync.js` cannot detect your earphone, run `ls /Volumes/` while the device is plugged in to see its mount name, and update `DEVICE_PATTERN` in `sync.js` accordingly.
