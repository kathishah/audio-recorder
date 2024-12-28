import 'https://cdnjs.cloudflare.com/ajax/libs/aws-sdk/2.1484.0/aws-sdk.min.js';
// import AWS from 'https://sdk.amazonaws.com/js/aws-sdk-2.1484.0.min.js';

const startButton = document.getElementById('startButton');
const recordingSection = document.getElementById('recordingSection');
const waveform = document.getElementById('waveform');
const canvasContext = waveform.getContext('2d');
const apiResultElement = document.getElementById('apiResult');
const analysisProgressContainer = document.getElementById('analysisProgressContainer'); 
const analysisProgress = document.getElementById('analysisProgress');

const awsConfig = {
  region: 'us-west-1',
  identityPoolId: 'us-west-1:b15a5865-d7e7-4153-9456-7d271afd31d6',
  bucketName: 'crispvoice-audio-recordings'
};

AWS.config.update({
  region: awsConfig.region,
  credentials: new AWS.CognitoIdentityCredentials({
      IdentityPoolId: awsConfig.identityPoolId
  })
});

const s3 = new AWS.S3();
const BUCKET_NAME = awsConfig.bucketName;

let audioContext;
let analyser;
let microphone;
let mediaRecorder;
let recordedChunks = [];
let dataArray;
let animationId;
let isRecording = false;

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

    // Prepare device names for toast message
    const microphoneName = microphoneDevice ? microphoneDevice.label : 'Default Microphone';
    const speakerName = speakerDevice ? speakerDevice.label : 'Default Speaker';

    // Show success toast with device names
    showToast(`🎤:${microphoneName} 🔈:${speakerName}`, 'success');

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

// Stop recording function
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
}

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
  const apiBaseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://audio-analyzer-api-af6843ebf910.herokuapp.com';
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

  // try {
  //     const s3Result = await uploadToS3(audioBlob, fileName);
  //     console.log('Upload successful:', s3Result);
  // } catch (uploadError) {
  //     uploadProgress.value = 0; // Set progress to 0
  //     uploadProgressContainer.innerHTML = `<label for="uploadProgress">Upload Progress:</label> 🔴`;
  //     console.error('Error uploading to S3:', uploadError);
  // }

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

  // Initialize audio recording
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();

  // Get microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  // Setup media recorder
  mediaRecorder = new MediaRecorder(stream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    
    // Optional: You can add code here to handle the recorded audio
    // For example, create a download link or play the recording
    console.log('Recording stopped. Blob URL:', url);
    await processAudio(blob);
  };

  // Start recording
  mediaRecorder.start();
  isRecording = true;

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
  let currentIndex = 5; // Start after the first 5 words

  // Clear the display area
  displayArea.value = '';

  // Preload the first 5 words
  const firstBatch = words.slice(0, 5).join(' ');
  displayArea.value = firstBatch;

  // Auto-scroll to the top (in case of residual scroll)
  displayArea.scrollTop = displayArea.scrollHeight;

  // Function to update the text area with words gradually
  const interval = setInterval(() => {
      if (currentIndex < words.length) {
          // Get the next batch of up to 5 words
          const nextBatch = words.slice(currentIndex, currentIndex + 5).join(' ');
          
          // Append the batch to the display area
          displayArea.value += ' ' + nextBatch;

          // Auto-scroll to show the latest lines
          displayArea.scrollTop = displayArea.scrollHeight;

          // Move to the next batch
          currentIndex += 5;
      } else {
          clearInterval(interval); // Stop the interval when all words are displayed
      }
  }, 2600); // Adjust the delay (in ms) for readability between batches}

  //TODO raise a toast to prompt to stop recording
}
