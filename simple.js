const startButton = document.getElementById('startButton');
const recordingSection = document.getElementById('recordingSection');
const waveform = document.getElementById('waveform');
const canvasContext = waveform.getContext('2d');

let audioContext;
let analyser;
let microphone;
let mediaRecorder;
let recordedChunks = [];
let dataArray;
let animationId;
let isRecording = false;

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

startButton.addEventListener('click', async () => {
  if (isRecording) {
    // If already recording, stop recording
    stopRecording();
    return;
  }

  // Disable button during countdown
  startButton.disabled = true;

  // Start countdown
  await startCountdown();

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

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    
    // Optional: You can add code here to handle the recorded audio
    // For example, create a download link or play the recording
    console.log('Recording stopped. Blob URL:', url);
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
