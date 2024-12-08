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
    const audioPlayback = document.getElementById('audioPlayback');
    const apiResultElement = document.getElementById('apiResult');
    const uploadProgressContainer = document.getElementById('uploadProgressContainer'); 
    const uploadProgress = document.getElementById('uploadProgress');
    const analysisProgressContainer = document.getElementById('analysisProgressContainer'); 
    const analysisProgress = document.getElementById('analysisProgress');

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

    // Function to upload audio to S3
    async function uploadToS3(audioBlob, fileName) {
        const params = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: audioBlob, // Ensure audioBlob is set as the Body
            ContentType: 'audio/wav'
        };

        return new Promise((resolve, reject) => {
            uploadProgress.value = 0; // Reset progress
            s3.upload(params, (err, data) => {
                if (err) {
                    console.error('Upload error:', err);
                    uploadProgress.value = 0; // Set progress to 0
                    uploadProgressContainer.innerHTML = `<label for="uploadProgress">Upload Progress:</label> 🔴`;
                    reject(err);
                } else {
                    console.log('Upload success:', data);
                    uploadProgressContainer.innerHTML = `<label for="uploadProgress">Upload Progress:</label> 🟢`;
                    resolve(data);
                }
            }).on('httpUploadProgress', (progress) => {
                const percentCompleted = Math.round((progress.loaded * 100) / progress.total);
                console.log('Upload progress:', percentCompleted + '%');
                uploadProgress.value = percentCompleted;
            });
        });
    }

    // Function to send audio for analysis
    async function sendForAnalysis(audioBlob, fileName) {
        const apiBaseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : 'https://audio-analyzer-api-af6843ebf910.herokuapp.com';
        const apiUrl = `${apiBaseUrl}/api/v1/analyze`;

        const formData = new FormData();
        formData.append('file', audioBlob, fileName);

        analysisProgress.value = 0; // Reset progress

        let progress = 5; // Initial progress value
        let intervalId;
    
        try {
            // Start progress updater
            intervalId = setInterval(() => {
                if (progress < 90) { // Increment progress up to 90%
                    progress += 10;
                    analysisProgress.value = progress;
                }
            }, 50);
    
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData,
            });
    
            clearInterval(intervalId); // Stop updating progress
            analysisProgress.value = 100; // Set to 100% once complete
    
            // Replace progress bar with a green checkmark
            analysisProgressContainer.innerHTML = `<label for="analysisProgress">Analysis Progress:</label> 🟢`;
            return response.json();
        } catch (error) {
            clearInterval(intervalId); // Ensure interval is cleared on error
            console.error('sendForAnalysis(): Error analyzing audio:', error);
    
            // Replace progress bar with a red cross emoji
            analysisProgressContainer.innerHTML = `<label for="analysisProgress">Analysis Progress:</label> 🔴`;
            throw error;
        }
    }

    // Main function to handle audio processing
    async function processAudio(audioBlob) {
        const fileName = generateFileName();

        try {
            const s3Result = await uploadToS3(audioBlob, fileName);
            console.log('Upload successful:', s3Result);
        } catch (uploadError) {
            uploadProgress.value = 0; // Set progress to 0
            uploadProgressContainer.innerHTML = `<label for="uploadProgress">Upload Progress:</label> 🔴`;
            console.error('Error uploading to S3:', uploadError);
        }

        try {
            apiResultElement.textContent = '';
            const apiResult = await sendForAnalysis(audioBlob, fileName);
            console.log('API Analysis Result:', apiResult);
            const { pesq_score, snr_db, sample_rate, quality_category } = apiResult;
            apiResultElement.textContent = `PESQ Score: ${pesq_score}, SNR: ${snr_db} dB, Sample Rate: ${sample_rate} Hz, Quality: ${quality_category}`;
        } catch (analysisError) {
            analysisProgress.value = 0; // Set progress to 0
            analysisProgress.innerHTML = 'ERROR'; // Display error message
            console.error('Error analyzing audio:', analysisError);
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
                await processAudio(audioBlob);
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
