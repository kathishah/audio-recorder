import { AudioRecorder } from './recorder.js';
import { startRecordingSession, analyzeRecording } from './analyzer.js';
import { generateFileName, loadRandomSentence, displaySentenceWithScrolling, showToast, sampleAudio } from './utils.js';

class AudioRecorderApp {
    constructor() {
        this.recorder = null;
        this.initialize();
    }

    async initialize() {
        try {
            // AudioRecorder constructor will call its own initialize()
            this.recorder = new AudioRecorder();
            await this.recorder.initialize();
            
            const startButton = document.getElementById('startButton');
            
            startButton.addEventListener('click', async () => {
                // Check device permissions first
                const hasPermissions = await this.recorder.checkDevicePermissions();
                if (!hasPermissions) {
                    return;
                }

                if (this.recorder.isRecording) {
                    this.recorder.stopRecording();
                    return;
                }

                // Show "Get ready..." toast
                showToast("Get ready...", "success", 3000);

                // Disable button during countdown
                startButton.disabled = true;

                // Start countdown
                await this.recorder.startCountdown();

                // Start a new recording session
                try {
                    await startRecordingSession(this.recorder.getDeviceInfo());
                } catch (error) {
                    console.error('Failed to start recording session:', error);
                    showToast('Failed to start recording session', 'error');
                    return;
                }

                // Load and display a random sentence
                try {
                    const sentence = await loadRandomSentence();
                    displaySentenceWithScrolling(sentence);
                } catch (error) {
                    console.error('Error loading sentence:', error);
                    showToast('Error loading sentence', 'error');
                }

                // Start recording
                this.recorder.mediaRecorder.start();
                this.recorder.isRecording = true;

                // Update UI
                startButton.classList.add('recording');
                startButton.disabled = false;  
                this.recorder.recordingSection.style.display = 'block';
                this.recorder.resultsSection.style.visibility = 'hidden';
                document.getElementById('progressSection').style.visibility = 'hidden';

                // Start visualization
                this.recorder.drawWaveform();
            });

            // Add event listener for when recording stops
            this.recorder.mediaRecorder.addEventListener('stop', async () => {
                const audioBlob = this.recorder.getRecordedAudioBlob();
                if (!audioBlob) {
                    console.error('No recorded audio data available');
                    showToast('No recorded audio data available', 'error');
                    return;
                }

                // Sample the audio first
                try {
                    await sampleAudio(audioBlob);
                    console.log('Audio blob processing complete');
                } catch (processingError) {
                    setProgress('uploadProgressCircleFill', 100, true);
                    console.error('Error processing audio blob:', processingError);
                    return;
                }

                const fileName = generateFileName();
                
                try {
                    const apiResult = await analyzeRecording(audioBlob, fileName);
                    console.log('API Analysis Result:', apiResult);
                    const { pesq_score, snr_db, sample_rate, quality_category } = apiResult;
                    
                    // Update quality score (0-4 range)
                    const clampedScore = Math.max(0, Math.min(4, pesq_score));
                    const percentage = (clampedScore / 4) * 100;
                    this.updateQualityScore(percentage);
                    
                    // Show results section
                    this.recorder.resultsSection.style.visibility = 'visible';
                } catch (error) {
                    console.error('Error analyzing audio:', error);
                }
            });
        } catch (error) {
            console.error('Error initializing AudioRecorderApp:', error);
            showToast('Failed to initialize audio recorder', 'error');
        }
    }

    updateQualityScore(percentage) {
        const marker = document.querySelector(".marker");
        if (marker) {
            marker.style.left = `${percentage}%`;
        }
    }
}

// Initialize the app when the DOM is loaded
let app = null;
document.addEventListener('DOMContentLoaded', () => {
    if (!app) {
        app = new AudioRecorderApp();
    }
});
