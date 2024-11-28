document.addEventListener('DOMContentLoaded', () => {
    const microphoneInfo = document.getElementById('microphoneInfo');
    const speakerInfo = document.getElementById('speakerInfo');
    const permissionStatus = document.getElementById('permissionStatus');
    const recordButton = document.getElementById('recordButton');
    const playButton = document.getElementById('playButton');
    const recordingStatus = document.getElementById('recordingStatus');
    const audioPlayback = document.getElementById('audioPlayback');

    let mediaRecorder;
    let audioChunks = [];
    let stream;
    let isRecording = false;
    let isPlaying = false;

    // Function to update device information
    async function updateDeviceInfo() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            const microphones = devices.filter(device => device.kind === 'audioinput');
            const speakers = devices.filter(device => device.kind === 'audiooutput');

            // Update microphone information
            if (microphones.length > 0) {
                const activeMic = microphones.find(mic => mic.deviceId === stream.getAudioTracks()[0].getSettings().deviceId);
                microphoneInfo.textContent = activeMic ? activeMic.label : 'Default Microphone';
            }

            // Update speaker information
            if (speakers.length > 0) {
                const defaultSpeaker = speakers.find(speaker => speaker.deviceId === 'default');
                speakerInfo.textContent = defaultSpeaker ? defaultSpeaker.label : 'Default Speaker';
            }
        } catch (error) {
            console.error('Error getting device info:', error);
        }
    }

    // Request microphone permissions on page load
    async function initialize() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            permissionStatus.textContent = 'Microphone access granted!';
            permissionStatus.className = 'status success';
            recordButton.disabled = false;

            // Update device information once we have permissions
            await updateDeviceInfo();

            // Set up MediaRecorder
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioPlayback.src = URL.createObjectURL(audioBlob);
                audioPlayback.style.display = 'block';
                playButton.disabled = false;
                recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
                recordButton.classList.remove('recording');
                recordingStatus.textContent = 'Recording stopped';
                recordingStatus.classList.remove('recording');
            };

        } catch (error) {
            console.error('Error accessing microphone:', error);
            permissionStatus.textContent = 'Error accessing microphone. Please ensure you have granted permission.';
            permissionStatus.className = 'status error';
        }
    }

    // Event listener for record button
    recordButton.addEventListener('click', () => {
        if (!isRecording) {
            // Start recording
            audioChunks = [];
            mediaRecorder.start();
            isRecording = true;
            recordButton.innerHTML = '<i class="fas fa-stop"></i>';
            recordButton.classList.add('recording');
            recordingStatus.textContent = '🔴 Recording...';
            recordingStatus.classList.add('recording');
            audioPlayback.style.display = 'none';
            playButton.disabled = true;
        } else {
            // Stop recording
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    // Event listener for play button
    playButton.addEventListener('click', () => {
        if (!isPlaying) {
            audioPlayback.play();
            isPlaying = true;
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
            playButton.classList.add('playing');
        } else {
            audioPlayback.pause();
            isPlaying = false;
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.classList.remove('playing');
        }
    });

    // Add event listeners for audio playback
    audioPlayback.addEventListener('ended', () => {
        isPlaying = false;
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        playButton.classList.remove('playing');
    });

    audioPlayback.addEventListener('pause', () => {
        isPlaying = false;
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        playButton.classList.remove('playing');
    });

    // Monitor for device changes
    navigator.mediaDevices.addEventListener('devicechange', updateDeviceInfo);

    // Initialize the application
    initialize();
});
