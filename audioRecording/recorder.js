import { audioMimeTypes, elementIds } from './config.js';
import { showToast } from './utils.js';

export class AudioRecorder {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.dataArray = null;
        this.animationId = null;
        this.isRecording = false;
        this.isPlaying = false;
        this.supportedMimeType = null;
        this.currentDeviceInfo = {
            microphone_details: null,
            speaker_details: null
        };

        // Get DOM elements
        this.startButton = document.getElementById(elementIds.startButton);
        this.recordingSection = document.getElementById(elementIds.recordingSection);
        this.waveform = document.getElementById(elementIds.waveform);
        this.canvasContext = this.waveform.getContext('2d');
        this.resultsSection = document.getElementById(elementIds.resultsSection);
        this.audioPlayback = document.getElementById(elementIds.audioPlayback);
        this.playButton = document.getElementById(elementIds.playButton);
        this.progressSection = document.getElementById(elementIds.progressSection);
    }

    async initialize() {
        console.log('Initializing AudioRecorder...');
        this.checkMimeTypes();
        this.setupEventListeners();  
        await this.setupMediaRecorder();
    }

    checkMimeTypes() {
        console.log('Checking audio MIME type support...');
        let output = '';
        audioMimeTypes.forEach(mimeType => {
            const isSupported = MediaRecorder.isTypeSupported(mimeType);
            output += `${mimeType}: ${isSupported ? 'Supported' : 'Not Supported'}\n`;
            if (isSupported) {
                this.supportedMimeType = mimeType;
            }
        });
        console.log(output);
        if (this.supportedMimeType) {
            showToast(`Supported MIME type: ${this.supportedMimeType}`, 'success');
        } else {
            showToast('No supported MIME type found', 'error');
        }
    }

    async checkDevicePermissions() {
        try {
            const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            const microphoneDevice = devices.find(device => 
                device.kind === 'audioinput' && device.deviceId === microphoneStream.getAudioTracks()[0].getSettings().deviceId
            );

            const speakerDevice = devices.find(device => device.kind === 'audiooutput');

            microphoneStream.getTracks().forEach(track => track.stop());

            this.currentDeviceInfo.microphone_details = microphoneDevice ? microphoneDevice.label : 'Default Microphone';
            this.currentDeviceInfo.speaker_details = speakerDevice ? speakerDevice.label : 'Default Speaker';

            console.log('Current Device Info:', this.currentDeviceInfo);
            showToast(`🎤:${this.currentDeviceInfo.microphone_details} 🔈:${this.currentDeviceInfo.speaker_details}`, 'success');

            return true;
        } catch (err) {
            console.error('Device permission error:', err);
            
            if (err.name === 'NotAllowedError') {
                showToast('Please grant microphone and speaker permissions to use this recorder.', 'error');
            } else if (err.message.includes('Speaker access not available')) {
                showToast('Speaker access is required. Please check your device settings.', 'error');
            } else {
                showToast('Unable to access recording devices. Please check your permissions.', 'error');
            }

            return false;
        }
    }

    startCountdown() {
        return new Promise((resolve) => {
            let countdown = 3;
            this.startButton.classList.add('countdown');
            this.startButton.classList.add(`countdown-${countdown}`);

            const countdownInterval = setInterval(() => {
                countdown--;
                this.startButton.classList.remove(`countdown-${countdown + 1}`);
                
                if (countdown > 0) {
                    this.startButton.classList.add(`countdown-${countdown}`);
                } else {
                    clearInterval(countdownInterval);
                    this.startButton.classList.remove('countdown');
                    this.startButton.classList.add('recording');
                    resolve();
                }
            }, 1000);
        });
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Reset button and recording state
        const startButton = document.getElementById('startButton');
        startButton.classList.remove('recording');
        this.isRecording = false;
        this.recordingSection.style.display = 'none';
        this.progressSection.style.visibility = 'visible';
        
        // Reset playback state
        this.isPlaying = false;
        this.playButton.innerHTML = '<i class="fas fa-play"></i>';
        this.playButton.classList.remove('playing');
    }

    drawWaveform() {
        this.canvasContext.fillStyle = 'rgb(200, 200, 200)';
        this.canvasContext.fillRect(0, 0, this.waveform.width, this.waveform.height);

        this.analyser.getByteTimeDomainData(this.dataArray);

        this.canvasContext.lineWidth = 2;
        this.canvasContext.strokeStyle = 'rgb(0, 0, 0)';
        this.canvasContext.beginPath();

        const sliceWidth = this.waveform.width * 1.0 / this.dataArray.length;
        let x = 0;

        for (let i = 0; i < this.dataArray.length; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * this.waveform.height / 2;

            if (i === 0) {
                this.canvasContext.moveTo(x, y);
            } else {
                this.canvasContext.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.canvasContext.lineTo(this.waveform.width, this.waveform.height / 2);
        this.canvasContext.stroke();

        this.animationId = requestAnimationFrame(() => this.drawWaveform());
    }

    setupEventListeners() {
        console.log('Setting up event listeners');
        
        // First remove any existing listeners
        const oldClickListener = this.playButton._clickListener;
        if (oldClickListener) {
            console.log('Removing old click listener');
            this.playButton.removeEventListener('click', oldClickListener);
        }

        // Create new listener and store reference
        const clickListener = () => {
            console.log('Play button clicked, isPlaying:', this.isPlaying);
            if (!this.isPlaying) {
                console.log('Starting playback, audio src:', this.audioPlayback.src);
                this.audioPlayback.play();
                this.isPlaying = true;
                this.playButton.innerHTML = '<i class="fas fa-pause"></i>';
                this.playButton.classList.add('playing');
            } else {
                console.log('Pausing playback');
                this.audioPlayback.pause();
                this.isPlaying = false;
                this.playButton.innerHTML = '<i class="fas fa-play"></i>';
                this.playButton.classList.remove('playing');
            }
        };
        
        // Store reference to new listener
        this.playButton._clickListener = clickListener;
        
        // Add new listener
        this.playButton.addEventListener('click', clickListener);
        console.log('Added new click listener');

        this.audioPlayback.addEventListener('ended', () => {
            console.log('Audio playback ended');
            this.isPlaying = false;
            this.playButton.innerHTML = '<i class="fas fa-play"></i>';
            this.playButton.classList.remove('playing');
        });

        this.audioPlayback.addEventListener('pause', () => {
            console.log('Audio playback paused');
            this.isPlaying = false;
            this.playButton.innerHTML = '<i class="fas fa-play"></i>';
            this.playButton.classList.remove('playing');
        });

        // Add error listener to catch playback issues
        this.audioPlayback.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            if (this.audioPlayback.error) {
                console.error('Error details:', this.audioPlayback.error.code, this.audioPlayback.error.message);
            }
        });
    }

    async setupMediaRecorder() {
        try {
            // Clean up previous audio context if it exists
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
            }
            if (this.microphone) {
                this.microphone.disconnect();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new AudioContext();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.analyser.fftSize = 2048;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: this.supportedMimeType
            });

            // Clear chunks when starting new recording
            this.mediaRecorder.addEventListener('start', () => {
                console.log('MediaRecorder started');
                this.recordedChunks = [];
            });

            // Collect audio data
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                console.log('MediaRecorder data available:', event.data.size);
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            });

            // Handle recording stop
            this.mediaRecorder.addEventListener('stop', () => {
                console.log('MediaRecorder stopped, chunks:', this.recordedChunks.length);
                if (this.recordedChunks.length > 0) {
                    const audioBlob = this.getRecordedAudioBlob();
                    const audioBlobUrl = URL.createObjectURL(audioBlob);
                    console.log('Recording stopped. Blob URL:', audioBlobUrl);
                    this.audioPlayback.src = audioBlobUrl;
                    this.playButton.style.display = 'inline-block';
                }
                // Stop all tracks in the stream
                stream.getTracks().forEach(track => track.stop());
            });

        } catch (error) {
            console.error('Error setting up MediaRecorder:', error);
            showToast('Error setting up audio recording', 'error');
            throw error;
        }
    }

    getDeviceInfo() {
        return {
            supportedMimeType: this.supportedMimeType,
            ...this.currentDeviceInfo
        };
    }

    getRecordedAudioBlob() {
        if (this.recordedChunks.length === 0) {
            return null;
        }
        return new Blob(this.recordedChunks, { type: this.supportedMimeType });
    }
}
