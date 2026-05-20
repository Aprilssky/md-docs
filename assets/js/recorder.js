/**
 * recorder.js — Browser audio recording via MediaRecorder API
 */
class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.state = 'inactive'; // inactive | recording | paused
    this.startTime = 0;
    this.timerInterval = null;
  }

  /** Request mic access and create MediaRecorder */
  async init() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
  }

  /** Start recording */
  start() {
    if (!this.mediaRecorder) throw new Error('Recorder not initialized');
    this.chunks = [];
    this.mediaRecorder.start(100); // collect data every 100ms
    this.state = 'recording';
    this.startTime = Date.now();
  }

  /** Stop recording and return audio blob */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.state === 'inactive') {
        reject(new Error('Not recording'));
        return;
      }
      this.mediaRecorder.onstop = () => {
        this.state = 'inactive';
        this.stopTimer();
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        this.chunks = [];
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  /** Pause/resume */
  pause() {
    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.state = 'paused';
    } else if (this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.state = 'recording';
    }
  }

  /** Clean up mic and resources */
  cleanup() {
    this.stopTimer();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.state = 'inactive';
  }

  /** Get elapsed seconds */
  get elapsed() {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  // ─── Timer ────────────────────────────────────

  onTick() {} // override

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => this.onTick?.(), 200);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
