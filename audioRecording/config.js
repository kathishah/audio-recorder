// Configuration constants
export const audioMimeTypes = [
    'audio/webm',
    'audio/mp4',
];

export const apiBaseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : 'https://audio-analyzer-api-af6843ebf910.herokuapp.com';

// DOM element IDs
export const elementIds = {
    startButton: 'startButton',
    recordingSection: 'recordingSection',
    waveform: 'waveform',
    resultsSection: 'resultsSection',
    audioPlayback: 'audioPlayback',
    playButton: 'playButton',
    displayArea: 'displayArea',
    progressSection: 'progressSection'
};
