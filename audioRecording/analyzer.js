import { apiBaseUrl } from './config.js';
import { setProgress, showToast, getClientIpAddress, getBrowserFingerprint } from './utils.js';

let currentSessionId = null;

// Function to start a new recording session
export async function startRecordingSession(deviceInfo) {
    try {
        const ipAddress = await getClientIpAddress();
        
        const requestData = {
            device_name: getBrowserFingerprint(),
            ip_address: ipAddress,
            audio_format: deviceInfo.supportedMimeType || 'audio/webm',
            microphone_details: deviceInfo.microphone_details || 'Unknown Microphone',
            speaker_details: deviceInfo.speaker_details || 'Unknown Speaker'
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

// Legacy analysis function
export async function analyzeAudio(audioBlob, fileName) {
    console.log(`Blob MIME type: ${audioBlob.type}`);

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

    try {
        console.log(`analyzeThis(): Sending audio for analysis... ${apiBaseUrl}/api/v1/analyze`);
        const response = await fetch(`${apiBaseUrl}/api/v1/analyze`, {
            method: 'POST',
            body: formData,
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
        clearInterval(intervalId);
        console.error('analyzeThis():', error);
        showToast(error.message, 'error');
        setProgress('analysisProgressCircleFill', 100, true);
        throw error;
    }
}

// Session-based analysis function
export async function analyzeWithSession(audioBlob, fileName) {
    try {
        if (!currentSessionId) {
            throw new Error('No active recording session');
        }

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

// Main analysis function that chooses between session-based and legacy analysis
export async function analyzeRecording(audioBlob, fileName) {
    try {
        let apiResult;
        if (currentSessionId) {
            console.log('Using session-based analysis with session ID:', currentSessionId);
            apiResult = await analyzeWithSession(audioBlob, fileName);
        } else {
            console.log('Using legacy analysis without session');
            apiResult = await analyzeAudio(audioBlob, fileName);
        }
        
        return apiResult;
    } catch (error) {
        console.error('Error analyzing audio:', error);
        setProgress('analysisProgressCircleFill', 100, true);
        throw error;
    }
}
