class MusicPlayer {
    constructor() {
        this.playlists = {}; // { playlistId: { name, files, handles } }
        this.currentPlaylistId = null;
        this.audioFiles = [];
        this.fileHandles = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.isShuffled = false;
        this.isRepeating = false;
        this.shuffledIndices = [];
        this.db = null;
        this.modalMode = null; // 'create' or 'rename'
        this.renamePlaylistId = null;
        
        this.audio = document.getElementById('audioPlayer');
        this.selectFilesBtn = document.getElementById('selectFiles');
        this.addMoreFilesBtn = document.getElementById('addMoreFiles');
        this.fileInput = document.getElementById('fileInput');
        this.directoryInput = document.getElementById('directoryInput');
        this.playlistItems = document.getElementById('playlistItems');
        this.currentPlaylistName = document.getElementById('currentPlaylistName');
        this.playlistsList = document.getElementById('playlistsList');
        this.createPlaylistBtn = document.getElementById('createPlaylistBtn');
        this.playlistModal = document.getElementById('playlistModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.playlistNameInput = document.getElementById('playlistNameInput');
        this.modalConfirm = document.getElementById('modalConfirm');
        this.modalCancel = document.getElementById('modalCancel');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.repeatBtn = document.getElementById('repeatBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.currentTimeEl = document.getElementById('currentTime');
        this.totalTimeEl = document.getElementById('totalTime');
        this.nowPlayingTitle = document.getElementById('nowPlayingTitle');
        this.nowPlayingArtist = document.getElementById('nowPlayingArtist');
        this.albumArt = document.getElementById('albumArt');
        this.albumArtImage = document.getElementById('albumArtImage');
        this.albumArtBtn = document.getElementById('albumArtBtn');
        this.albumArtInput = document.getElementById('albumArtInput');
        this.albumArtPlaceholder = this.albumArt.querySelector('.album-art-placeholder');

        this.init();
        this.initMediaSession();
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
               ('ontouchstart' in window);
    }

    initMediaSession() {
        // Check if Media Session API is supported
        if ('mediaSession' in navigator) {
            // Set up action handlers
            navigator.mediaSession.setActionHandler('play', () => {
                this.togglePlayPause();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                this.togglePlayPause();
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                this.playPrevious();
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                this.playNext();
            });

            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skipTime = details.seekOffset || 10;
                this.audio.currentTime = Math.max(0, this.audio.currentTime - skipTime);
            });

            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skipTime = details.seekOffset || 10;
                this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + skipTime);
            });

            // Update playback state when it changes
            this.audio.addEventListener('play', () => {
                this.updateMediaSessionPlaybackState();
            });

            this.audio.addEventListener('pause', () => {
                this.updateMediaSessionPlaybackState();
            });
        }
    }

    updateMediaSessionMetadata(file) {
        if (!('mediaSession' in navigator)) return;

        const fileName = file.name.replace(/\.[^/.]+$/, '');
        const parts = fileName.split(' - ');
        const title = parts.length > 1 ? parts[1] : parts[0];
        const artist = parts.length > 1 ? parts[0] : 'Unknown Artist';

        // Get album art if available
        let artwork = [];
        if (this.currentPlaylistId && this.playlists[this.currentPlaylistId]?.albumArt) {
            artwork = [{
                src: this.playlists[this.currentPlaylistId].albumArt,
                sizes: '300x300',
                type: 'image/png'
            }];
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: this.playlists[this.currentPlaylistId]?.name || 'Music Player',
            artwork: artwork
        });
    }

    updateMediaSessionPlaybackState() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';

        // Update position state for seeking
        if (this.audio.duration) {
            navigator.mediaSession.setPositionState({
                duration: this.audio.duration,
                playbackRate: this.audio.playbackRate,
                position: this.audio.currentTime
            });
        }
    }

    async init() {
        // Initialize IndexedDB
        await this.initDB();
        
        // Load saved playlists
        await this.loadSavedPlaylists();

        // Initialize default playlist if none exist
        if (Object.keys(this.playlists).length === 0) {
            await this.createPlaylist('My Playlist');
        }

        // Set first playlist as current if none selected
        if (!this.currentPlaylistId) {
            this.currentPlaylistId = Object.keys(this.playlists)[0];
            await this.switchPlaylist(this.currentPlaylistId);
        }

        // Render playlists list
        this.renderPlaylistsList();

        // Modal handlers
        this.createPlaylistBtn.addEventListener('click', () => this.showCreatePlaylistModal());
        this.modalCancel.addEventListener('click', () => this.hideModal());
        this.modalConfirm.addEventListener('click', () => this.handleModalConfirm());
        this.playlistNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleModalConfirm();
            }
        });
        this.playlistModal.addEventListener('click', (e) => {
            if (e.target === this.playlistModal) {
                this.hideModal();
            }
        });

        // File selection - prefer File System Access API (not available on mobile)
        // Mobile devices will use the fallback file input
        let isAddingMore = false;
        
        if ('showOpenFilePicker' in window && !this.isMobileDevice()) {
            // Desktop: Use File System Access API
            this.selectFilesBtn.addEventListener('click', () => this.selectFilesModern());
            this.addMoreFilesBtn.addEventListener('click', () => this.selectFilesModern(true));
        } else {
            // Mobile/Fallback: Use regular file input
            this.selectFilesBtn.addEventListener('click', () => {
                isAddingMore = false;
                this.fileInput.click();
            });
            this.addMoreFilesBtn.addEventListener('click', () => {
                isAddingMore = true;
                this.fileInput.click();
            });
            this.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    if (isAddingMore) {
                        this.addFiles(files, null);
                    } else {
                        this.handleFiles(files, null);
                    }
                }
                e.target.value = '';
            });
        }

        // Audio player events
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.playNext());
        this.audio.addEventListener('error', () => this.handleError());

        // Control buttons
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.playPrevious());
        this.nextBtn.addEventListener('click', () => this.playNext());
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());

        // Volume control
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.audio.volume = 0.7;

        // Progress bar
        this.progressBar.addEventListener('click', (e) => this.seek(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Album art upload - ensure button is always clickable
        this.albumArtBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Always allow album art upload if we have a playlist
            if (this.currentPlaylistId && this.playlists[this.currentPlaylistId]) {
                this.albumArtInput.click();
            } else {
                // If no playlist selected, ensure we have one
                if (Object.keys(this.playlists).length === 0) {
                    this.createPlaylist('My Playlist').then(id => {
                        this.currentPlaylistId = id;
                        this.switchPlaylist(id).then(() => {
                            this.albumArtInput.click();
                        });
                    });
                } else {
                    const firstId = Object.keys(this.playlists)[0];
                    this.switchPlaylist(firstId).then(() => {
                        this.albumArtInput.click();
                    });
                }
            }
        });
        this.albumArtInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                if (!this.currentPlaylistId) {
                    // Ensure we have a playlist selected
                    if (Object.keys(this.playlists).length === 0) {
                        this.createPlaylist('My Playlist').then(id => {
                            this.currentPlaylistId = id;
                            this.switchPlaylist(id).then(() => {
                                this.setAlbumArt(file);
                            });
                        });
                    } else {
                        const firstId = Object.keys(this.playlists)[0];
                        this.switchPlaylist(firstId).then(() => {
                            this.setAlbumArt(file);
                        });
                    }
                } else {
                    this.setAlbumArt(file);
                }
            }
            e.target.value = '';
        });
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('MusicPlayerDB', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('playlists')) {
                    db.createObjectStore('playlists', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('currentPlaylist')) {
                    db.createObjectStore('currentPlaylist', { keyPath: 'id' });
                }
            };
        });
    }

    async savePlaylists() {
        if (!this.db) return;
        
        const transaction = this.db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        
        // Clear and save all playlists
        await store.clear();
        
        for (const [id, playlist] of Object.entries(this.playlists)) {
            // Convert file handles to serializable format
            const playlistData = {
                id: id,
                name: playlist.name,
                files: playlist.files.map(file => ({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified
                })),
                handles: playlist.handles, // File handles can be stored directly in IndexedDB
                albumArt: playlist.albumArt || null
            };
            await store.add(playlistData);
        }

        // Save current playlist ID
        const currentTransaction = this.db.transaction(['currentPlaylist'], 'readwrite');
        const currentStore = currentTransaction.objectStore('currentPlaylist');
        await currentStore.clear();
        if (this.currentPlaylistId) {
            await currentStore.add({ id: 'current', playlistId: this.currentPlaylistId });
        }
    }

    async loadSavedPlaylists() {
        if (!this.db) return;
        
        try {
            // Load playlists
            const transaction = this.db.transaction(['playlists'], 'readonly');
            const store = transaction.objectStore('playlists');
            const request = store.getAll();
            
            const savedPlaylists = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            // Load current playlist ID
            const currentTransaction = this.db.transaction(['currentPlaylist'], 'readonly');
            const currentStore = currentTransaction.objectStore('currentPlaylist');
            const currentRequest = currentStore.get('current');
            
            const currentData = await new Promise((resolve, reject) => {
                currentRequest.onsuccess = () => resolve(currentRequest.result);
                currentRequest.onerror = () => reject(currentRequest.error);
            });

            if (currentData) {
                this.currentPlaylistId = currentData.playlistId;
            }

            // Restore playlists
            for (const saved of savedPlaylists) {
                const files = [];
                const handles = [];
                
                for (let i = 0; i < saved.files.length; i++) {
                    const fileData = saved.files[i];
                    const handle = saved.handles && saved.handles[i] ? saved.handles[i] : null;
                    
                    if (handle) {
                        try {
                            // Verify handle is still valid
                            const file = await handle.getFile();
                            files.push(file);
                            handles.push(handle);
                        } catch (error) {
                            console.warn('Could not restore file handle:', fileData.name);
                        }
                    } else {
                        // Create a File-like object from metadata (limited functionality)
                        const file = new File([], fileData.name, {
                            type: fileData.type,
                            lastModified: fileData.lastModified
                        });
                        files.push(file);
                        handles.push(null);
                    }
                }

                this.playlists[saved.id] = {
                    name: saved.name,
                    files: files,
                    handles: handles,
                    albumArt: saved.albumArt || null
                };
            }
        } catch (error) {
            console.error('Error loading saved playlists:', error);
        }
    }

    async createPlaylist(name) {
        const id = 'playlist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.playlists[id] = {
            name: name,
            files: [],
            handles: [],
            albumArt: null
        };
        
        await this.savePlaylists();
        this.renderPlaylistsList();
        
        return id;
    }

    async deletePlaylist(id) {
        if (Object.keys(this.playlists).length === 1) {
            alert('You must have at least one playlist.');
            return;
        }

        if (confirm(`Are you sure you want to delete "${this.playlists[id].name}"?`)) {
            // If deleting current playlist, switch to another first
            if (this.currentPlaylistId === id) {
                const remainingIds = Object.keys(this.playlists).filter(pid => pid !== id);
                if (remainingIds.length > 0) {
                    await this.switchPlaylist(remainingIds[0]);
                }
            }
            
            // Delete from object
            delete this.playlists[id];
            
            // Save to IndexedDB (this will clear and re-save all playlists, effectively removing the deleted one)
            await this.savePlaylists();
            
            // Re-render the playlists list
            this.renderPlaylistsList();
        }
    }

    async renamePlaylist(id, newName) {
        if (this.playlists[id]) {
            this.playlists[id].name = newName;
            await this.savePlaylists();
            this.renderPlaylistsList();
            if (id === this.currentPlaylistId) {
                this.currentPlaylistName.textContent = newName;
            }
        }
    }

    async switchPlaylist(id) {
        if (!this.playlists[id]) return;

        // Save current playlist state
        if (this.currentPlaylistId) {
            this.playlists[this.currentPlaylistId].files = [...this.audioFiles];
            this.playlists[this.currentPlaylistId].handles = [...this.fileHandles];
        }

        // Load new playlist
        this.currentPlaylistId = id;
        const playlist = this.playlists[id];
        this.audioFiles = [...playlist.files];
        this.fileHandles = [...playlist.handles];
        
        // Stop current playback
        this.audio.pause();
        this.isPlaying = false;
        this.currentIndex = -1;
        this.shuffledIndices = [];
        
        // Update UI
        this.currentPlaylistName.textContent = playlist.name;
        this.renderPlaylist();
        this.renderPlaylistsList(); // Update highlighting
        this.updatePlayPauseButton();
        
        // Load album art if exists
        if (playlist.albumArt) {
            this.displayAlbumArt(playlist.albumArt);
        } else {
            this.resetAlbumArt();
        }
        
        if (this.audioFiles.length === 0) {
            this.nowPlayingTitle.textContent = 'Add audio files to start';
            this.nowPlayingArtist.textContent = '';
        }

        await this.savePlaylists();
    }

    renderPlaylistsList() {
        this.playlistsList.innerHTML = '';
        
        Object.entries(this.playlists).forEach(([id, playlist]) => {
            const item = document.createElement('div');
            item.className = 'playlist-item-list' + (id === this.currentPlaylistId ? ' active' : '');
            item.dataset.playlistId = id;
            
            item.innerHTML = `
                <span class="playlist-item-list-name">${playlist.name}</span>
                <div class="playlist-item-list-actions">
                    <button class="playlist-action-btn rename" title="Rename playlist">✏️</button>
                    <button class="playlist-action-btn delete" title="Delete playlist">🗑️</button>
                </div>
            `;

            // Switch playlist on click (but not on action buttons)
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('playlist-action-btn')) {
                    this.switchPlaylist(id);
                }
            });

            // Rename button
            const renameBtn = item.querySelector('.rename');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showRenamePlaylistModal(id);
            });

            // Delete button
            const deleteBtn = item.querySelector('.delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePlaylist(id);
            });

            this.playlistsList.appendChild(item);
        });
    }

    showCreatePlaylistModal() {
        this.modalMode = 'create';
        this.modalTitle.textContent = 'Create New Playlist';
        this.playlistNameInput.value = '';
        this.playlistNameInput.placeholder = 'Enter playlist name';
        this.modalConfirm.textContent = 'Create';
        this.playlistModal.classList.add('show');
        this.playlistNameInput.focus();
    }

    showRenamePlaylistModal(id) {
        this.modalMode = 'rename';
        this.renamePlaylistId = id;
        const playlist = this.playlists[id];
        this.modalTitle.textContent = 'Rename Playlist';
        this.playlistNameInput.value = playlist.name;
        this.playlistNameInput.placeholder = 'Enter playlist name';
        this.modalConfirm.textContent = 'Rename';
        this.playlistModal.classList.add('show');
        this.playlistNameInput.focus();
        this.playlistNameInput.select();
    }

    hideModal() {
        this.playlistModal.classList.remove('show');
        this.modalMode = null;
        this.renamePlaylistId = null;
    }

    async handleModalConfirm() {
        const name = this.playlistNameInput.value.trim();
        if (!name) {
            alert('Please enter a playlist name.');
            return;
        }

        if (this.modalMode === 'create') {
            const newId = await this.createPlaylist(name);
            await this.switchPlaylist(newId);
        } else if (this.modalMode === 'rename') {
            await this.renamePlaylist(this.renamePlaylistId, name);
        }

        this.hideModal();
    }

    async selectFilesModern(addMore = false) {
        try {
            const fileHandles = await window.showOpenFilePicker({
                multiple: true,
                types: [{
                    description: 'Audio Files',
                    accept: {
                        'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
                    }
                }]
            });

            const files = [];
            const handles = [];
            
            for (const handle of fileHandles) {
                const file = await handle.getFile();
                if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)) {
                    files.push(file);
                    handles.push(handle);
                }
            }

            if (files.length === 0) {
                alert('No valid audio files selected.');
                return;
            }

            if (addMore) {
                this.addFiles(files, handles);
            } else {
                this.handleFiles(files, handles);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting files:', error);
            }
        }
    }

    handleFiles(files, handles = null) {
        if (!this.currentPlaylistId) return;

        this.audioFiles = Array.from(files)
            .filter(file => file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i))
            .sort((a, b) => a.name.localeCompare(b.name));

        this.fileHandles = handles || new Array(this.audioFiles.length).fill(null);

        if (this.audioFiles.length === 0) {
            alert('No valid audio files found.');
            return;
        }

        // Update playlist
        this.playlists[this.currentPlaylistId].files = [...this.audioFiles];
        this.playlists[this.currentPlaylistId].handles = [...this.fileHandles];

        this.renderPlaylist();
        this.currentIndex = -1;
        this.shuffledIndices = [];
        this.savePlaylists();
    }

    addFiles(files, handles = null) {
        if (!this.currentPlaylistId) return;

        const newFiles = Array.from(files)
            .filter(file => file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i));

        if (newFiles.length === 0) {
            alert('No valid audio files found.');
            return;
        }

        // Add new files to existing list
        this.audioFiles.push(...newFiles);
        this.audioFiles.sort((a, b) => a.name.localeCompare(b.name));

        // Update handles array
        const newHandles = handles || new Array(newFiles.length).fill(null);
        this.fileHandles.push(...newHandles);
        
        // Rebuild handles array to match sorted files
        this.rebuildHandlesArray();

        // Update playlist
        this.playlists[this.currentPlaylistId].files = [...this.audioFiles];
        this.playlists[this.currentPlaylistId].handles = [...this.fileHandles];

        this.renderPlaylist();
        this.savePlaylists();
    }

    rebuildHandlesArray() {
        const handlesMap = new Map();
        this.fileHandles.forEach((handle, index) => {
            if (handle && this.audioFiles[index]) {
                handlesMap.set(this.audioFiles[index].name, handle);
            }
        });

        this.fileHandles = this.audioFiles.map(file => handlesMap.get(file.name) || null);
    }

    removeFile(index) {
        if (index < 0 || index >= this.audioFiles.length || !this.currentPlaylistId) return;

        // If removing currently playing track, stop and move to next
        if (index === this.currentIndex) {
            this.audio.pause();
            this.isPlaying = false;
            this.updatePlayPauseButton();
            
            if (this.audioFiles.length > 1) {
                const nextIndex = index < this.audioFiles.length - 1 ? index : index - 1;
                this.playTrack(nextIndex);
            } else {
                this.currentIndex = -1;
                this.audio.src = '';
                this.nowPlayingTitle.textContent = 'Add audio files to start';
                this.nowPlayingArtist.textContent = '';
            }
        } else if (index < this.currentIndex) {
            this.currentIndex--;
        }

        // Remove file and handle
        this.audioFiles.splice(index, 1);
        this.fileHandles.splice(index, 1);

        // Update playlist
        this.playlists[this.currentPlaylistId].files = [...this.audioFiles];
        this.playlists[this.currentPlaylistId].handles = [...this.fileHandles];

        // Update shuffled indices
        if (this.isShuffled) {
            this.shuffledIndices = this.shuffledIndices
                .filter(i => i !== index)
                .map(i => i > index ? i - 1 : i);
        }

        this.renderPlaylist();
        this.savePlaylists();
    }

    renderPlaylist() {
        this.playlistItems.innerHTML = '';
        
        this.audioFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.dataset.index = index;
            
            const fileName = file.name.replace(/\.[^/.]+$/, '');
            const parts = fileName.split(' - ');
            const title = parts.length > 1 ? parts[1] : parts[0];
            const artist = parts.length > 1 ? parts[0] : 'Unknown Artist';

            item.innerHTML = `
                <div class="playlist-item-icon">🎵</div>
                <div class="playlist-item-info">
                    <div class="playlist-item-title">${title}</div>
                    <div class="playlist-item-artist">${artist}</div>
                </div>
                <button class="remove-btn" title="Remove from playlist">×</button>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-btn')) {
                    this.playTrack(index);
                }
            });

            const removeBtn = item.querySelector('.remove-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(index);
            });

            this.playlistItems.appendChild(item);
        });

        this.updateActiveItem();
    }

    playTrack(index) {
        if (index < 0 || index >= this.audioFiles.length) return;

        this.currentIndex = index;
        const file = this.audioFiles[index];
        const url = URL.createObjectURL(file);
        
        if (this.audio.src && this.audio.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.audio.src);
        }
        
        this.audio.src = url;
        this.updateNowPlaying(file);
        this.updateActiveItem();
        
        // Update Media Session metadata
        this.updateMediaSessionMetadata(file);
        
        this.audio.play().then(() => {
            this.isPlaying = true;
            this.updatePlayPauseButton();
            this.updateMediaSessionPlaybackState();
        }).catch(error => {
            console.error('Error playing audio:', error);
            this.handleError();
        });
    }

    updateNowPlaying(file) {
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        const parts = fileName.split(' - ');
        const title = parts.length > 1 ? parts[1] : parts[0];
        const artist = parts.length > 1 ? parts[0] : 'Unknown Artist';

        this.nowPlayingTitle.textContent = title;
        this.nowPlayingArtist.textContent = artist;

        this.audio.addEventListener('loadedmetadata', () => {
            this.albumArt.innerHTML = '<div class="album-art-placeholder">🎵</div>';
        }, { once: true });
    }

    updateActiveItem() {
        document.querySelectorAll('.playlist-item').forEach((item, index) => {
            if (index === this.currentIndex) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    togglePlayPause() {
        if (this.currentIndex === -1 && this.audioFiles.length > 0) {
            this.playTrack(0);
            return;
        }

        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
        } else {
            this.audio.play().then(() => {
                this.isPlaying = true;
            }).catch(error => {
                console.error('Error playing audio:', error);
            });
        }
        this.updatePlayPauseButton();
        this.updateMediaSessionPlaybackState();
    }

    updatePlayPauseButton() {
        this.playPauseBtn.textContent = this.isPlaying ? '⏸' : '▶';
    }

    playPrevious() {
        if (this.audioFiles.length === 0) return;

        let newIndex;
        if (this.isShuffled && this.shuffledIndices.length > 0) {
            const currentShuffledPos = this.shuffledIndices.indexOf(this.currentIndex);
            newIndex = currentShuffledPos > 0 
                ? this.shuffledIndices[currentShuffledPos - 1]
                : this.shuffledIndices[this.shuffledIndices.length - 1];
        } else {
            newIndex = this.currentIndex > 0 
                ? this.currentIndex - 1 
                : this.audioFiles.length - 1;
        }

        this.playTrack(newIndex);
    }

    playNext() {
        if (this.audioFiles.length === 0) return;

        if (this.isRepeating && this.currentIndex !== -1) {
            this.playTrack(this.currentIndex);
            return;
        }

        let newIndex;
        if (this.isShuffled && this.shuffledIndices.length > 0) {
            const currentShuffledPos = this.shuffledIndices.indexOf(this.currentIndex);
            newIndex = currentShuffledPos < this.shuffledIndices.length - 1
                ? this.shuffledIndices[currentShuffledPos + 1]
                : this.shuffledIndices[0];
        } else {
            newIndex = this.currentIndex < this.audioFiles.length - 1
                ? this.currentIndex + 1
                : 0;
        }

        this.playTrack(newIndex);
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        this.shuffleBtn.classList.toggle('active', this.isShuffled);
        
        if (this.isShuffled) {
            this.shuffledIndices = Array.from({ length: this.audioFiles.length }, (_, i) => i);
            for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.shuffledIndices[i], this.shuffledIndices[j]] = [this.shuffledIndices[j], this.shuffledIndices[i]];
            }
        } else {
            this.shuffledIndices = [];
        }
    }

    toggleRepeat() {
        this.isRepeating = !this.isRepeating;
        this.repeatBtn.classList.toggle('active', this.isRepeating);
    }

    setVolume(value) {
        this.audio.volume = value / 100;
        this.volumeValue.textContent = `${value}%`;
        
        const volumeIcon = document.querySelector('.volume-icon');
        if (value == 0) {
            volumeIcon.textContent = '🔇';
        } else if (value < 50) {
            volumeIcon.textContent = '🔉';
        } else {
            volumeIcon.textContent = '🔊';
        }
    }

    updateDuration() {
        const duration = this.audio.duration;
        this.totalTimeEl.textContent = this.formatTime(duration);
        
        // Update Media Session position state when duration is available
        if ('mediaSession' in navigator && duration) {
            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: this.audio.playbackRate,
                position: this.audio.currentTime
            });
        }
    }

    updateProgress() {
        const current = this.audio.currentTime;
        const duration = this.audio.duration;
        
        if (duration) {
            const percent = (current / duration) * 100;
            this.progressFill.style.width = `${percent}%`;
            this.currentTimeEl.textContent = this.formatTime(current);
            
            // Update Media Session position state periodically
            if ('mediaSession' in navigator && this.isPlaying) {
                navigator.mediaSession.setPositionState({
                    duration: duration,
                    playbackRate: this.audio.playbackRate,
                    position: current
                });
            }
        }
    }

    seek(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const duration = this.audio.duration;
        
        if (duration) {
            this.audio.currentTime = percent * duration;
            
            // Update Media Session position state after seeking
            if ('mediaSession' in navigator) {
                navigator.mediaSession.setPositionState({
                    duration: duration,
                    playbackRate: this.audio.playbackRate,
                    position: this.audio.currentTime
                });
            }
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    handleError() {
        console.error('Error loading audio file');
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }

    handleKeyboard(e) {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            this.togglePlayPause();
        }
        else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            this.playPrevious();
        }
        else if (e.code === 'ArrowRight') {
            e.preventDefault();
            this.playNext();
        }
    }

    async setAlbumArt(file) {
        if (!this.currentPlaylistId) {
            console.warn('No playlist selected, cannot set album art');
            return Promise.reject('No playlist selected');
        }

        if (!this.playlists[this.currentPlaylistId]) {
            console.warn('Current playlist not found');
            return Promise.reject('Playlist not found');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imageData = e.target.result;
                    this.playlists[this.currentPlaylistId].albumArt = imageData;
                    this.displayAlbumArt(imageData);
                    this.savePlaylists();
                    resolve();
                } catch (error) {
                    console.error('Error setting album art:', error);
                    reject(error);
                }
            };
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                reject(error);
            };
            reader.readAsDataURL(file);
        });
    }

    displayAlbumArt(imageData) {
        this.albumArtImage.src = imageData;
        this.albumArtImage.style.display = 'block';
        this.albumArtPlaceholder.style.display = 'none';
    }

    resetAlbumArt() {
        this.albumArtImage.src = '';
        this.albumArtImage.style.display = 'none';
        this.albumArtPlaceholder.style.display = 'block';
    }
}

// Initialize the player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
});
