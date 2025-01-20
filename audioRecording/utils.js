// Toast notification function
export function showToast(message, type = 'error', duration = 5000) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }

    toast.classList.remove('success', 'error', 'show');
    toast.textContent = message;
    toast.classList.add(type, 'show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Generate timestamped filename
export function generateFileName() {
    const now = new Date();
    const timestamp = now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '');
    return `input_${timestamp}`;
}

// Progress circle update function
export function setProgress(circleId, value, isError = false) {
    const circle = document.getElementById(circleId);
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    circle.style.stroke = isError ? 'red' : value >= 100 ? '#4caf50' : '#2196f3';

    const offset = circumference - (value / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}

// Get client IP address
export async function getClientIpAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error getting IP address:', error);
        return 'unknown';
    }
}

// Get browser fingerprint
export function getBrowserFingerprint() {
    const userAgent = navigator.userAgent;
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
    
    const fingerprint = `${userAgent}|${platform}|${language}|${screenResolution}|${colorDepth}|${timeZone}`;
    console.log('Browser Fingerprint:', fingerprint);
    return fingerprint;
}

// Load and display random sentence
export function loadRandomSentence() {
    return fetch('sentences.txt')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n').filter(line => line.trim() !== '');
            if (lines.length === 0) {
                throw new Error('No valid sentences found in the file.');
            }
            return lines[Math.floor(Math.random() * lines.length)];
        });
}

// Display sentence with scrolling effect
export function displaySentenceWithScrolling(sentence) {
    const displayArea = document.getElementById('displayArea');
    const words = sentence.split(' ');
    const firstFiveWords = words.slice(0, 5).join(' ');
    const remainingSentence = sentence.slice(firstFiveWords.length).trim();

    displayArea.value = firstFiveWords + ' ';
    let currentIndex = 0;

    const typingInterval = setInterval(() => {
        if (currentIndex < remainingSentence.length) {
            displayArea.value += remainingSentence[currentIndex];
            currentIndex++;
            displayArea.scrollTop = displayArea.scrollHeight;
        } else {
            clearInterval(typingInterval);
        }
    }, 100);

    showToast("Click (🎤) to stop recording", "success");
}

// Sample audio and update progress circle
export async function sampleAudio(audioBlob) {
    const totalSize = audioBlob.size;
    const chunkSize = 128 * 1024; // 128 KB chunks
    let loaded = 0;

    return new Promise((resolve, reject) => {
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
                resolve();
            }
        };

        reader.onerror = (error) => {
            console.error('Processing error:', error);
            showToast('Processing error: ' + error.message, 'error');
            reject(error);
        };

        function readNextChunk() {
            const chunk = audioBlob.slice(loaded, loaded + chunkSize);
            reader.readAsArrayBuffer(chunk);
        }

        // Start processing
        readNextChunk();
    });
}
