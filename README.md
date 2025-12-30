# 🎵 Music Player

A beautiful, modern web-based MP3 player with an Apple Music/Spotify-like interface.

## Features

- 📁 **Directory Selection**: Select a folder containing audio files
- 🎵 **Playlist Management**: Automatically creates a playlist from selected files
- ▶️ **Playback Controls**: Play, pause, previous, next, shuffle, and repeat
- 🔊 **Volume Control**: Adjustable volume slider
- ⏱️ **Progress Tracking**: Visual progress bar with time display
- ⌨️ **Keyboard Shortcuts**: 
  - `Space` - Play/Pause
  - `←` - Previous track
  - `→` - Next track
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations

## Supported Audio Formats

- MP3
- WAV
- OGG
- M4A
- FLAC
- AAC

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Edge, Firefox, Safari)
2. Click the "Select Music Folder" button
3. Choose a directory containing your audio files
4. Click on any song in the playlist to start playing
5. Use the controls to navigate and manage playback

## Browser Compatibility

- **Chrome/Edge**: Full support with File System Access API (modern directory picker)
- **Firefox/Safari**: Uses fallback file input (select multiple files from a folder)

## File Naming

For best results, name your files in the format:
```
Artist - Song Title.mp3
```

The player will automatically extract the artist and title from the filename.

## Notes

- The player runs entirely in your browser - no server required
- Audio files are loaded into memory, so very large directories may take time to load
- The player supports both the modern File System Access API and the traditional file input method

