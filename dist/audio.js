const BEAT_HISTORY_SIZE = 43;
const BEAT_DECAY = 0.98;
const BEAT_MIN_INTERVAL = 0.15; // minimum time between beats (seconds)
function calculateLoudness(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(1, rms * 10); // normalize to 0-1
}
function detectBeat(loudness, detector, currentTime) {
    detector.energyHistory.push(loudness);
    if (detector.energyHistory.length > BEAT_HISTORY_SIZE) {
        detector.energyHistory.shift();
    }
    if (detector.energyHistory.length < BEAT_HISTORY_SIZE) {
        return 0;
    }
    const avgEnergy = detector.energyHistory.reduce((a, b) => a + b, 0) /
        detector.energyHistory.length;
    const variance = detector.energyHistory.reduce((sum, val) => sum + Math.pow(val - avgEnergy, 2), 0) / detector.energyHistory.length;
    detector.threshold = -15 * variance + 1.55;
    const timeSinceLastBeat = currentTime - detector.lastBeatTime;
    if (loudness > detector.threshold &&
        timeSinceLastBeat > BEAT_MIN_INTERVAL) {
        detector.lastBeatTime = currentTime;
        detector.beat = 1.0;
        return 1.0;
    }
    detector.beat = Math.max(0, detector.beat * BEAT_DECAY);
    return detector.beat;
}
function detectMusic(loudness, beat) {
    // music detection based on consistent patterns
    // higher confidence when there's both loudness and beat activity
    const baseConfidence = Math.min(1, loudness * 1.5);
    const beatBoost = beat > 0.3 ? 0.3 : 0;
    return Math.min(1, baseConfidence + beatBoost);
}
export function createBeatDetector() {
    return {
        energyHistory: [],
        lastBeatTime: 0,
        threshold: 0.3,
        beat: 0,
    };
}
export function analyzeAudio(dataArray, detector, currentTime) {
    const loudness = calculateLoudness(dataArray);
    const beat = detectBeat(loudness, detector, currentTime);
    const music = detectMusic(loudness, beat);
    return { loudness, beat, music };
}
export async function initAudio(onAnalysis) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    const detector = createBeatDetector();
    let animationFrameId;
    let startTime = performance.now();
    function analyze() {
        analyser.getFloatTimeDomainData(dataArray);
        const currentTime = (performance.now() - startTime) / 1000;
        const analysis = analyzeAudio(dataArray, detector, currentTime);
        onAnalysis(analysis);
        animationFrameId = requestAnimationFrame(analyze);
    }
    analyze();
    return () => {
        cancelAnimationFrame(animationFrameId);
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
    };
}
