// AWS Configuration
const awsConfig = {
    region: 'us-west-1',
    identityPoolId: 'us-west-1:b15a5865-d7e7-4153-9456-7d271afd31d6',
    bucketName: 'crispvoice-audio-recordings'
};

document.addEventListener('DOMContentLoaded', () => {
    const microphoneInfo = document.getElementById('microphoneInfo');
    const speakerInfo = document.getElementById('speakerInfo');
    const permissionStatus = document.getElementById('permissionStatus');
    const recordButton = document.getElementById('recordButton');
    const playButton = document.getElementById('playButton');
    const recordingStatus = document.getElementById('recordingStatus');
    const audioPlayback = document.getElementById('audioPlayback');

    // AWS Configuration
    AWS.config.update({
        region: awsConfig.region,
        credentials: new AWS.CognitoIdentityCredentials({
            IdentityPoolId: awsConfig.identityPoolId
        })
    });

    const s3 = new AWS.S3();
    const BUCKET_NAME = awsConfig.bucketName;

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

    // Function to generate timestamped filename
    function generateFileName() {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[:.]/g, '-') // Replace colons and periods with hyphens
            .replace('T', '_') // Replace T with underscore
            .replace('Z', ''); // Remove Z
        return `recording_${timestamp}.wav`;
    }

    // Function to upload to S3
    async function uploadToS3(audioBlob) {
        const fileName = generateFileName();
        
        try {
            console.log('Starting S3 upload with params:', {
                Bucket: BUCKET_NAME,
                Key: fileName,
                ContentType: 'audio/wav'
            });

            const params = {
                Bucket: BUCKET_NAME,
                Key: fileName,
                Body: audioBlob,
                ContentType: 'audio/wav'
            };

            const upload = s3.upload(params);
            
            // Add upload progress indicator
            upload.on('httpUploadProgress', (progress) => {
                const percentCompleted = Math.round((progress.loaded * 100) / progress.total);
                console.log('Upload progress:', percentCompleted + '%');
                recordingStatus.textContent = `Uploading: ${percentCompleted}%`;
            });

            console.log('Awaiting upload completion...');
            const result = await upload.promise();
            console.log('Upload successful:', result);
            recordingStatus.textContent = 'Upload complete!';
            return result.Location;
        } catch (error) {
            console.error('Detailed upload error:', {
                message: error.message,
                code: error.code,
                statusCode: error.statusCode,
                requestId: error.requestId,
                stack: error.stack
            });
            recordingStatus.textContent = `Error uploading: ${error.message}`;
            throw error;
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

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioPlayback.src = URL.createObjectURL(audioBlob);
                audioPlayback.style.display = 'block';
                playButton.disabled = false;
                recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
                recordButton.classList.remove('recording');
                recordingStatus.textContent = 'Processing recording...';
                
                try {
                    const uploadUrl = await uploadToS3(audioBlob);
                    recordingStatus.textContent = 'Recording saved and uploaded!';
                } catch (error) {
                    recordingStatus.textContent = 'Error saving recording';
                    console.error('Upload failed:', error);
                }
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
