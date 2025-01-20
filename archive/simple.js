const startButton = document.getElementById('startButton');
const recordingSection = document.getElementById('recordingSection');
const waveform = document.getElementById('waveform');
const canvasContext = waveform.getContext('2d');
const resultsSection = document.getElementById('resultsSection');
const audioPlayback = document.getElementById('audioPlayback');
const playButton = document.getElementById('playButton');
const spectrum = document.querySelector(".spectrum");
const marker = document.querySelector(".marker");

let audioContext;
let analyser;
let microphone;
let mediaRecorder;
let recordedChunks = [];
let dataArray;
let animationId;
let isRecording = false;
let isPlaying = false;
let supportedMimeType = null;
let currentSessionId = null;
let currentDeviceInfo = {
    microphone_details: null,
    speaker_details: null
};

const audioMimeTypes = [
  'audio/webm',
  'audio/mp4',
];

const checkMimeTypes = () => {
  console.log('Checking audio MIME type support...');
  let output = '';
  audioMimeTypes.forEach(mimeType => {
      const isSupported = MediaRecorder.isTypeSupported(mimeType);
      output += `${mimeType}: ${isSupported ? 'Supported' : 'Not Supported'}\n`;
      if (isSupported) {
        supportedMimeType = mimeType;
      }
  });
  console.log(output);
  if (supportedMimeType) {  
    showToast(`Supported MIME type: ${supportedMimeType}`, 'success');
  } else {
    showToast('No supported MIME type found', 'error');
  }
};

// Call the function to check support
checkMimeTypes();

// Toast notification function
function showToast(message, type = 'error', duration = 5000) {
  // Create toast element if it doesn't exist
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  // Reset previous classes
  toast.classList.remove('success', 'error', 'show');

  // Set message and show toast
  toast.textContent = message;
  toast.classList.add(type, 'show');

  // Remove toast after specified duration
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Function to check device permissions
async function checkDevicePermissions() {
    try {
        // Get microphone access
        const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Enumerate devices to get device names
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Find microphone and speaker devices
        const microphoneDevice = devices.find(device => 
            device.kind === 'audioinput' && device.deviceId === microphoneStream.getAudioTracks()[0].getSettings().deviceId
        );

        const speakerDevice = devices.find(device => device.kind === 'audiooutput');

        // Close the temporary stream
        microphoneStream.getTracks().forEach(track => track.stop());

        // Store device info for session creation
        currentDeviceInfo.microphone_details = microphoneDevice ? microphoneDevice.label : 'Default Microphone';
        currentDeviceInfo.speaker_details = speakerDevice ? speakerDevice.label : 'Default Speaker';

        console.log('Current Device Info:', currentDeviceInfo);
        // Show success toast with device names
        showToast(`🎤:${currentDeviceInfo.microphone_details} 🔈:${currentDeviceInfo.speaker_details}`, 'success');

        return true;
    } catch (err) {
        console.error('Device permission error:', err);
    
        // Provide user-friendly error messages via toast
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

// Countdown function
function startCountdown() {
  return new Promise((resolve) => {
    let countdown = 3;
    startButton.classList.add('countdown');
    startButton.classList.add(`countdown-${countdown}`);

    const countdownInterval = setInterval(() => {
      countdown--;
      
      // Remove previous countdown class
      startButton.classList.remove(`countdown-${countdown + 1}`);
      
      if (countdown > 0) {
        // Add new countdown class
        startButton.classList.add(`countdown-${countdown}`);
      } else {
        // Countdown finished
        clearInterval(countdownInterval);
        startButton.classList.remove('countdown');
        startButton.classList.add('recording');
        resolve();
      }
    }, 1000);
  });
}

// Function to start a new recording session
async function startRecordingSession() {
    try {
        const apiBaseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://audio-analyzer-api-af6843ebf910.herokuapp.com';
        
        // Get client IP address
        const ipAddress = await getClientIpAddress();
        
        // Create request data object
        const requestData = {
            device_name: getBrowserFingerprint(),
            ip_address: ipAddress,
            audio_format: supportedMimeType || 'audio/webm',
            microphone_details: currentDeviceInfo.microphone_details || 'Unknown Microphone',
            speaker_details: currentDeviceInfo.speaker_details || 'Unknown Speaker'
        };

        console.log('Starting recording session with data:', requestData);

        const response = await fetch(`${apiBaseUrl}/api/v1/recording-session/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to start recording session');
        }
        
        const responseData = await response.json();
        currentSessionId = responseData.recording_session_id;
        return currentSessionId;
    } catch (error) {
        console.error('Error starting recording session:', error);
        showToast('Failed to start recording session', 'error');
        throw error;
    }
}

// Function to sample audioBlob and update progress circle
async function sampleAudio(audioBlob) {
  const totalSize = audioBlob.size;
  const chunkSize = 128 * 1024; // 512 KB chunks
  let loaded = 0;

  const reader = new FileReader();

  reader.onload = () => {
    loaded += chunkSize;
    const percentCompleted = Math.min(Math.round((loaded * 100) / totalSize), 100);
    console.log('Processing progress:', percentCompleted + '%');
    setProgress('uploadProgressCircleFill', percentCompleted);

    if (loaded < totalSize) {
      readNextChunk();
    } else {
      console.log('Processing complete');
      // showToast('Audio processing complete', 'success');
    }
  };

  reader.onerror = (error) => {
    console.error('Processing error:', error);
    showToast('Processing error: ' + error.message, 'error');
  };

  function readNextChunk() {
    const chunk = audioBlob.slice(loaded, loaded + chunkSize);
    reader.readAsArrayBuffer(chunk);
  }

  // Start processing
  readNextChunk();
}

// Function to send audio for analysis
async function analyzeThis(audioBlob, fileName) {
  const apiBaseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://audio-analyzer-api-af6843ebf910.herokuapp.com';
  const apiUrl = `${apiBaseUrl}/api/v1/analyze`;

  console.log(`Blob MIME type: ${audioBlob.type}`);

  const formData = new FormData();
  formData.append('file', audioBlob, fileName);

  let progress = 5; // Initial progress value
  setProgress('analysisProgressCircleFill', progress);

  let intervalId;

  try {
      // Start progress updater
      intervalId = setInterval(() => {
          if (progress < 90) { // Increment progress up to 90%
            setProgress('analysisProgressCircleFill', progress);
            progress += 10;
          }
      }, 50);

      console.log(`analyzeThis(): Sending audio for analysis... ${apiUrl}`);
      const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error('API response: ' + response.status + ' | ' + error.detail);
      } else {
        console.log(`analyzeThis(): API response: ${response.status}`);
      }

      clearInterval(intervalId); // Stop updating progress
      progress = 100; // Set to 100% once complete
      setProgress('analysisProgressCircleFill', progress);

      return response.json();
  } catch (error) {
      clearInterval(intervalId); // Ensure interval is cleared on error
      console.error('analyzeThis():', error);
      showToast(error.message, 'error');
      setProgress('analysisProgressCircleFill', 100, true);
      throw error;
  }
}

// Function to analyze audio with session
async function analyzeWithSession(audioBlob, fileName) {
    try {
        if (!currentSessionId) {
            throw new Error('No active recording session');
        }

        const apiBaseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://audio-analyzer-api-af6843ebf910.herokuapp.com';
        const formData = new FormData();
        formData.append('file', audioBlob, fileName);

        let progress = 5;
        setProgress('analysisProgressCircleFill', progress);

        let intervalId = setInterval(() => {
            if (progress < 90) {
                setProgress('analysisProgressCircleFill', progress);
                progress += 10;
            }
        }, 50);

        console.log(`analyzeWithSession(): Sending audio for analysis with session ${currentSessionId}`);
        const response = await fetch(`${apiBaseUrl}/api/v1/recording-session/${currentSessionId}/analyze`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error('API response: ' + response.status + ' | ' + error.detail);
        }

        clearInterval(intervalId);
        progress = 100;
        setProgress('analysisProgressCircleFill', progress);

        return response.json();
    } catch (error) {
        console.error('analyzeWithSession():', error);
        setProgress('analysisProgressCircleFill', 100, true);
        showToast(error.message, 'error');
        throw error;
    }
}

// Main function to handle audio processing
async function processAudio(audioBlob) {
  const fileName = generateFileName();

  try {
    // for now, just sample the audio
    await sampleAudio(audioBlob);
    console.log('Audio blob processing complete');
  } catch (processingError) {
    setProgress('uploadProgressCircleFill', 100, true);
    console.error('Error processing audio blob:', processingError);
    return;
  }

  try {
      let apiResult;
      if (currentSessionId) {
          console.log('Using session-based analysis with session ID:', currentSessionId);
          apiResult = await analyzeWithSession(audioBlob, fileName);
      } else {
          console.log('Using legacy analysis without session');
          apiResult = await analyzeThis(audioBlob, fileName);
      }
      
      console.log('API Analysis Result:', apiResult);
      const { pesq_score, snr_db, sample_rate, quality_category } = apiResult;
      updateQualityScore(pesq_score);
  } catch (analysisError) {
      console.error('Error analyzing audio:', analysisError);
      setProgress('analysisProgressCircleFill', 100, true);
  }
}

function updateQualityScore(score) {

  // Ensure score is within 0-4 range
  const clampedScore = Math.max(0, Math.min(4, score));

  // Calculate percentage position based on score
  const percentage = (clampedScore / 4) * 100;

  // Update marker position
  marker.style.left = `calc(${percentage}% - 2.5px)`; // Adjust for marker width

  resultsSection.style.visibility = 'visible';
}

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

startButton.addEventListener('click', async () => {
  // Check device permissions first
  const hasPermissions = await checkDevicePermissions();
  if (!hasPermissions) {
    return;
  }

  if (isRecording) {
    // If already recording, stop recording
    stopRecording();
    return;
  }

  // Show "Get ready..." toast
  showToast("Get ready...", "success", 3000);

  // Disable button during countdown
  startButton.disabled = true;

  // Start countdown
  await startCountdown();

  // Load a random sentence
  loadRandomSentence(); 

  // Show the recording section
  recordingSection.style.display = 'block';

  // Get microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  // Setup media recorder
  mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
  recordedChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: supportedMimeType });
    const audioBlobUrl = URL.createObjectURL(blob);
    console.log('Recording stopped. Blob URL:', audioBlobUrl);
    audioPlayback.src = audioBlobUrl;
    await processAudio(blob);
  };

  // Start recording session
  await startRecordingSession();

  // Start recording
  mediaRecorder.start();
  isRecording = true;

  // Initialize audio context and analyser
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  microphone = audioContext.createMediaStreamSource(stream);
  microphone.connect(analyser);

  // Set up analyser
  analyser.fftSize = 2048;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  // Draw the waveform
  drawWaveform();

  // Re-enable button when done
  startButton.disabled = false;
});

function drawWaveform() {
  const WIDTH = waveform.width;
  const HEIGHT = waveform.height;

  animationId = requestAnimationFrame(drawWaveform);

  analyser.getByteTimeDomainData(dataArray);

  // Clear canvas
  canvasContext.fillStyle = '#f4f4f4';
  canvasContext.fillRect(0, 0, WIDTH, HEIGHT);

  // Draw waveform
  canvasContext.lineWidth = 2;
  canvasContext.strokeStyle = '#0078d7';
  canvasContext.beginPath();

  let sliceWidth = WIDTH / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    let v = dataArray[i] / 128.0;
    let y = (v * HEIGHT) / 2;

    if (i === 0) {
      canvasContext.moveTo(x, y);
    } else {
      canvasContext.lineTo(x, y);
    }

    x += sliceWidth;
  }

  canvasContext.lineTo(WIDTH, HEIGHT / 2);
  canvasContext.stroke();
}

function loadRandomSentence() {
  // Fetch the sentences from the text file
  fetch('sentences.txt')
      .then(response => response.text())
      .then(data => {
          // Split file contents into lines and filter out empty ones
          const lines = data.split('\n').filter(line => line.trim() !== '');

          // Check if there are any valid lines
          if (lines.length === 0) {
              console.error('No valid sentences found in the file.');
              return;
          }

          // Select a random line
          const randomSentence = lines[Math.floor(Math.random() * lines.length)];

          console.log(randomSentence);

          // Display the sentence in the textarea with scrolling
          displaySentenceWithScrolling(randomSentence);
      })
      .catch(err => {
          console.error('Error loading the sentences:', err);
      });
}

function displaySentenceWithScrolling(sentence) {
  const displayArea = document.getElementById('displayArea');
  const words = sentence.split(' ');
  const firstFiveWords = words.slice(0, 5).join(' ');
  const remainingSentence = sentence.slice(firstFiveWords.length).trim();

  // Set the display area with the first 5 words
  displayArea.value = firstFiveWords + ' ';
  let currentIndex = 0;

  // Function to simulate typing for the remaining characters
  const typingInterval = setInterval(() => {
      if (currentIndex < remainingSentence.length) {
          // Add the next character from the remaining sentence
          displayArea.value += remainingSentence[currentIndex];
          currentIndex++;

          // Auto-scroll to the bottom
          displayArea.scrollTop = displayArea.scrollHeight;
      } else {
          clearInterval(typingInterval); // Stop typing when the sentence is complete
      }
  }, 100); // Adjust typing speed (in ms) as needed

  showToast("Click (🎤) to stop recording", "success");
}

function setProgress(circleId, value, isError = false) {
  const circle = document.getElementById(circleId);
  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;

  // Ensure the circle is properly initialized
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${circumference}`;

  // Set the color based on the error state
  if (isError) {
    circle.style.stroke = 'red'; // Set to red for error
  } else {
    circle.style.stroke = value >= 100 ? '#4caf50' : '#2196f3'; // Green when complete, blue otherwise
  }

  // Calculate the stroke offset based on the progress value
  const offset = circumference - (value / 100) * circumference;
  circle.style.strokeDashoffset = offset;
}

function generateFileName() {
  const now = new Date();
  const timestamp = now.toISOString()
      .replace(/[:.]/g, '-') // Replace colons and periods with hyphens
      .replace('T', '_') // Replace T with underscore
      .replace('Z', ''); // Remove Z
  return `input_${timestamp}`;
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  // Stop waveform animation
  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  // Reset button and recording state
  startButton.classList.remove('recording');
  isRecording = false;
  recordingSection.style.display = 'none';  
  progressSection.style.visibility  = 'visible';
}

// Function to get client IP address
async function getClientIpAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error getting IP address:', error);
        return 'unknown';
    }
}

// Function to get browser fingerprint
function getBrowserFingerprint() {
    const userAgent = navigator.userAgent;
    // Use userAgentData if available (modern browsers), otherwise fallback to userAgent parsing
    const platform = navigator.userAgentData 
        ? navigator.userAgentData.platform 
        : userAgent.includes('Win') ? 'Windows' 
            : userAgent.includes('Mac') ? 'macOS' 
                : userAgent.includes('Linux') ? 'Linux' 
                    : 'Unknown';
    const language = navigator.language;
    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const colorDepth = window.screen.colorDepth;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Create a more robust fingerprint by combining these values
    const fingerprint = `${userAgent}|${platform}|${language}|${screenResolution}|${colorDepth}|${timeZone}`;
    console.log('Browser Fingerprint:', fingerprint);
    return fingerprint;
}
