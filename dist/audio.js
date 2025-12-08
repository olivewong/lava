function calculateLoudness(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(1, rms * 10); // normalize to 0-1
}
export function analyzeAudio(dataArray) {
    const loudness = calculateLoudness(dataArray);
    return { loudness };
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
    let animationFrameId;
    function analyze() {
        analyser.getFloatTimeDomainData(dataArray);
        const analysis = analyzeAudio(dataArray);
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
