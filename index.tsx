/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

// Type definitions for the Web Speech API to fix TypeScript errors.
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  start(): void;
  stop(): void;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

import {GoogleGenAI, GenerateContentResponse, Chat, Part} from '@google/genai';
import {marked} from 'marked';
import * as docx from 'docx';

const MODEL_NAME = 'gemini-2.5-flash';

interface Note {
  id: string;
  title: string;
  rawTranscription: string;
  polishedNote: string;
  timestamp: number;
}

interface AttachedFile {
  name: string;
  mimeType: string;
  data: string; // Base64 encoded
  url: string; // Data URL for preview
}

class VoiceNotesApp {
  private genAI: GoogleGenAI;
  private mediaRecorder: MediaRecorder | null = null;
  private recordButton: HTMLButtonElement;
  private recordingStatus: HTMLDivElement;
  private rawTranscription: HTMLDivElement;
  private polishedNote: HTMLDivElement;
  private guideButton: HTMLButtonElement;
  private downloadButton: HTMLButtonElement;
  private historyButton: HTMLButtonElement;
  private historyModal: HTMLDivElement;
  private closeHistoryModalButton: HTMLButtonElement;
  private historyList: HTMLUListElement;
  private guideModal: HTMLDivElement;
  private closeGuideModalButton: HTMLButtonElement;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private currentNote: Note | null = null;
  private notesHistory: Note[] = [];
  private stream: MediaStream | null = null;
  private editorTitle: HTMLDivElement;
  private hasAttemptedPermission = false;

  private recordingInterface: HTMLDivElement;
  private liveRecordingTitle: HTMLDivElement;
  private liveWaveformCanvas: HTMLCanvasElement | null;
  private liveWaveformCtx: CanvasRenderingContext2D | null = null;
  private liveRecordingTimerDisplay: HTMLDivElement;
  private statusIndicatorDiv: HTMLDivElement | null;

  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private waveformDataArray: Uint8Array | null = null;
  private waveformDrawingId: number | null = null;
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;

  // AI Chat properties
  private aiChatButton: HTMLButtonElement;
  private aiChatModal: HTMLDivElement;
  private closeAiChatModalButton: HTMLButtonElement;
  private chatMessages: HTMLDivElement;
  private chatInput: HTMLInputElement;
  private sendChatButton: HTMLButtonElement;
  private chat: Chat | null = null;
  private attachFileButton: HTMLButtonElement;
  private voiceInputButton: HTMLButtonElement;
  private fileInput: HTMLInputElement;
  private attachmentPreviewContainer: HTMLDivElement;
  private attachedFile: AttachedFile | null = null;
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;


  constructor() {
    this.genAI = new GoogleGenAI({
      apiKey: process.env.API_KEY!,
    });

    this.recordButton = document.getElementById(
      'recordButton',
    ) as HTMLButtonElement;
    this.recordingStatus = document.getElementById(
      'recordingStatus',
    ) as HTMLDivElement;
    this.rawTranscription = document.getElementById(
      'rawTranscription',
    ) as HTMLDivElement;
    this.polishedNote = document.getElementById(
      'polishedNote',
    ) as HTMLDivElement;
    this.guideButton = document.getElementById('guideButton') as HTMLButtonElement;
    this.downloadButton = document.getElementById(
      'downloadButton',
    ) as HTMLButtonElement;
    this.editorTitle = document.querySelector(
      '.editor-title',
    ) as HTMLDivElement;
    
    this.historyButton = document.getElementById('historyButton') as HTMLButtonElement;
    this.historyModal = document.getElementById('historyModal') as HTMLDivElement;
    this.closeHistoryModalButton = document.getElementById('closeHistoryModal') as HTMLButtonElement;
    this.historyList = document.getElementById('historyList') as HTMLUListElement;

    this.guideModal = document.getElementById('guideModal') as HTMLDivElement;
    this.closeGuideModalButton = document.getElementById('closeGuideModal') as HTMLButtonElement;

    // AI Chat elements
    this.aiChatButton = document.getElementById('aiChatButton') as HTMLButtonElement;
    this.aiChatModal = document.getElementById('aiChatModal') as HTMLDivElement;
    this.closeAiChatModalButton = document.getElementById('closeAiChatModal') as HTMLButtonElement;
    this.chatMessages = document.getElementById('chatMessages') as HTMLDivElement;
    this.chatInput = document.getElementById('chatInput') as HTMLInputElement;
    this.sendChatButton = document.getElementById('sendChatButton') as HTMLButtonElement;
    this.attachFileButton = document.getElementById('attachFileButton') as HTMLButtonElement;
    this.voiceInputButton = document.getElementById('voiceInputButton') as HTMLButtonElement;
    this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
    this.attachmentPreviewContainer = document.getElementById('attachmentPreviewContainer') as HTMLDivElement;

    this.recordingInterface = document.querySelector(
      '.recording-interface',
    ) as HTMLDivElement;
    this.liveRecordingTitle = document.getElementById(
      'liveRecordingTitle',
    ) as HTMLDivElement;
    this.liveWaveformCanvas = document.getElementById(
      'liveWaveformCanvas',
    ) as HTMLCanvasElement;
    this.liveRecordingTimerDisplay = document.getElementById(
      'liveRecordingTimerDisplay',
    ) as HTMLDivElement;

    if (this.liveWaveformCanvas) {
      this.liveWaveformCtx = this.liveWaveformCanvas.getContext('2d');
    } else {
      console.warn(
        'Không tìm thấy phần tử canvas cho dạng sóng trực tiếp. Trình hiển thị sẽ không hoạt động.',
      );
    }

    if (this.recordingInterface) {
      this.statusIndicatorDiv = this.recordingInterface.querySelector(
        '.status-indicator',
      ) as HTMLDivElement;
    } else {
      console.warn('Không tìm thấy phần tử giao diện ghi âm.');
      this.statusIndicatorDiv = null;
    }

    this.bindEventListeners();
    this.loadHistory();
    this.initSpeechRecognition();
    this.createNewNote(false); // Initial load, don't save

    this.recordingStatus.textContent = 'Sẵn sàng ghi âm';
  }

  private bindEventListeners(): void {
    this.recordButton.addEventListener('click', () => this.toggleRecording());
    this.guideButton.addEventListener('click', () => this.toggleGuideModal(true));
    this.downloadButton.addEventListener('click', () => this.downloadAsDocx());
    this.historyButton.addEventListener('click', () => this.toggleHistoryModal(true));
    this.closeHistoryModalButton.addEventListener('click', () => this.toggleHistoryModal(false));
    this.historyModal.addEventListener('click', (e) => {
        if (e.target === this.historyModal) {
            this.toggleHistoryModal(false);
        }
    });
    this.closeGuideModalButton.addEventListener('click', () => this.toggleGuideModal(false));
    this.guideModal.addEventListener('click', (e) => {
        if (e.target === this.guideModal) {
            this.toggleGuideModal(false);
        }
    });
    
    // AI Chat Listeners
    this.aiChatButton.addEventListener('click', () => this.toggleAiChatModal(true));
    this.closeAiChatModalButton.addEventListener('click', () => this.toggleAiChatModal(false));
    this.aiChatModal.addEventListener('click', (e) => {
        if (e.target === this.aiChatModal) {
            this.toggleAiChatModal(false);
        }
    });
    this.sendChatButton.addEventListener('click', () => this.handleSendMessage());
    this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendMessage();
        }
    });
    this.attachFileButton.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.voiceInputButton.addEventListener('click', () => this.toggleVoiceInput());
    
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private handleResize(): void {
    if (
      this.isRecording &&
      this.liveWaveformCanvas &&
      this.liveWaveformCanvas.style.display === 'block'
    ) {
      requestAnimationFrame(() => {
        this.setupCanvasDimensions();
      });
    }
  }

  private setupCanvasDimensions(): void {
    if (!this.liveWaveformCanvas || !this.liveWaveformCtx) return;

    const canvas = this.liveWaveformCanvas;
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    this.liveWaveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private async toggleRecording(): Promise<void> {
    if (!this.isRecording) {
      await this.startRecording();
    } else {
      await this.stopRecording();
    }
  }

  private setupAudioVisualizer(): void {
    if (!this.stream || this.audioContext) return;

    this.audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyserNode = this.audioContext.createAnalyser();

    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.75;

    const bufferLength = this.analyserNode.frequencyBinCount;
    this.waveformDataArray = new Uint8Array(bufferLength);

    source.connect(this.analyserNode);
  }

  private drawLiveWaveform(): void {
    if (
      !this.analyserNode ||
      !this.waveformDataArray ||
      !this.liveWaveformCtx ||
      !this.liveWaveformCanvas ||
      !this.isRecording
    ) {
      if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
      return;
    }

    this.waveformDrawingId = requestAnimationFrame(() =>
      this.drawLiveWaveform(),
    );
    this.analyserNode.getByteFrequencyData(this.waveformDataArray);

    const ctx = this.liveWaveformCtx;
    const canvas = this.liveWaveformCanvas;

    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const bufferLength = this.analyserNode.frequencyBinCount;
    const numBars = Math.floor(bufferLength * 0.5);

    if (numBars === 0) return;

    const totalBarPlusSpacingWidth = logicalWidth / numBars;
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7));
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3));

    let x = 0;

    const recordingColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-recording')
        .trim() || '#ff3b30';
    ctx.fillStyle = recordingColor;

    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break;

      const dataIndex = Math.floor(i * (bufferLength / numBars));
      const barHeightNormalized = this.waveformDataArray[dataIndex] / 255.0;
      let barHeight = barHeightNormalized * logicalHeight;

      if (barHeight < 1 && barHeight > 0) barHeight = 1;
      barHeight = Math.round(barHeight);

      const y = Math.round((logicalHeight - barHeight) / 2);

      ctx.fillRect(Math.floor(x), y, barWidth, barHeight);
      x += barWidth + barSpacing;
    }
  }

  private updateLiveTimer(): void {
    if (!this.isRecording || !this.liveRecordingTimerDisplay) return;
    const now = Date.now();
    const elapsedMs = now - this.recordingStartTime;

    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((elapsedMs % 1000) / 10);

    this.liveRecordingTimerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  private startLiveDisplay(): void {
    if (
      !this.recordingInterface ||
      !this.liveRecordingTitle ||
      !this.liveWaveformCanvas ||
      !this.liveRecordingTimerDisplay
    ) {
      console.warn(
        'One or more live display elements are missing. Cannot start live display.',
      );
      return;
    }

    this.recordingInterface.classList.add('is-live');
    this.liveRecordingTitle.style.display = 'block';
    this.liveWaveformCanvas.style.display = 'block';
    this.liveRecordingTimerDisplay.style.display = 'block';

    this.setupCanvasDimensions();

    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'none';

    const iconElement = this.recordButton.querySelector(
      '.record-button-inner i',
    ) as HTMLElement;
    if (iconElement) {
      iconElement.classList.remove('fa-microphone');
      iconElement.classList.add('fa-stop');
    }

    const currentTitle = this.editorTitle.textContent?.trim();
    const placeholder =
      this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
    this.liveRecordingTitle.textContent =
      currentTitle && currentTitle !== placeholder
        ? currentTitle
        : 'Bản ghi mới';

    this.setupAudioVisualizer();
    this.drawLiveWaveform();

    this.recordingStartTime = Date.now();
    this.updateLiveTimer();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = window.setInterval(() => this.updateLiveTimer(), 50);
  }

  private stopLiveDisplay(): void {
    if (
      !this.recordingInterface ||
      !this.liveRecordingTitle ||
      !this.liveWaveformCanvas ||
      !this.liveRecordingTimerDisplay
    ) {
      if (this.recordingInterface)
        this.recordingInterface.classList.remove('is-live');
      return;
    }
    this.recordingInterface.classList.remove('is-live');
    this.liveRecordingTitle.style.display = 'none';
    this.liveWaveformCanvas.style.display = 'none';
    this.liveRecordingTimerDisplay.style.display = 'none';

    if (this.statusIndicatorDiv)
      this.statusIndicatorDiv.style.display = 'block';

    const iconElement = this.recordButton.querySelector(
      '.record-button-inner i',
    ) as HTMLElement;
    if (iconElement) {
      iconElement.classList.remove('fa-stop');
      iconElement.classList.add('fa-microphone');
    }

    if (this.waveformDrawingId) {
      cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
    }
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    if (this.liveWaveformCtx && this.liveWaveformCanvas) {
      this.liveWaveformCtx.clearRect(
        0,
        0,
        this.liveWaveformCanvas.width,
        this.liveWaveformCanvas.height,
      );
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext
          .close()
          .catch((e) => console.warn('Error closing audio context', e));
      }
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.waveformDataArray = null;
  }

  private async startRecording(): Promise<void> {
    // Save the current note and reset the editor before starting a new recording.
    this.createNewNote(true);

    try {
      this.audioChunks = [];
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        this.audioContext = null;
      }

      this.recordingStatus.textContent = 'Đang yêu cầu quyền truy cập micro...';

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({audio: true});
      } catch (err) {
        console.error('Thất bại với các ràng buộc cơ bản:', err);
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: 'audio/webm',
        });
      } catch (e) {
        console.error('audio/webm không được hỗ trợ, đang thử mặc định:', e);
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0)
          this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        this.stopLiveDisplay();

        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm',
          });
          this.processAudio(audioBlob).catch((err) => {
            console.error('Lỗi xử lý âm thanh:', err);
            this.recordingStatus.textContent = 'Lỗi xử lý bản ghi';
            this.enableRecordButton();
          });
        } else {
          this.recordingStatus.textContent =
            'Không có dữ liệu âm thanh nào được ghi lại. Vui lòng thử lại.';
          this.enableRecordButton();
        }

        if (this.stream) {
          this.stream.getTracks().forEach((track) => {
            track.stop();
          });
          this.stream = null;
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      this.recordButton.classList.add('recording');
      this.recordButton.setAttribute('title', 'Dừng ghi âm');

      this.startLiveDisplay();
    } catch (error) {
      console.error('Lỗi bắt đầu ghi âm:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';

      if (
        errorName === 'NotAllowedError' ||
        errorName === 'PermissionDeniedError'
      ) {
        this.recordingStatus.textContent =
          'Quyền truy cập micro bị từ chối. Vui lòng kiểm tra cài đặt trình duyệt và tải lại trang.';
      } else if (
        errorName === 'NotFoundError' ||
        (errorName === 'DOMException' &&
          errorMessage.includes('Requested device not found'))
      ) {
        this.recordingStatus.textContent =
          'Không tìm thấy micro. Vui lòng kết nối micro.';
      } else if (
        errorName === 'NotReadableError' ||
        errorName === 'AbortError' ||
        (errorName === 'DOMException' &&
          errorMessage.includes('Failed to allocate audiosource'))
      ) {
        this.recordingStatus.textContent =
          'Không thể truy cập micro. Micro có thể đang được sử dụng bởi một ứng dụng khác.';
      } else {
        this.recordingStatus.textContent = `Lỗi: ${errorMessage}`;
      }

      this.isRecording = false;
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Bắt đầu ghi âm');
      this.stopLiveDisplay();
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.error('Lỗi dừng MediaRecorder:', e);
        this.stopLiveDisplay();
      }

      this.isRecording = false;

      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Đang xử lý...');
      this.recordButton.disabled = true;
      this.recordingStatus.textContent = 'Đang xử lý âm thanh...';
    } else {
      if (!this.isRecording) this.stopLiveDisplay();
    }
  }

  private enableRecordButton(): void {
    this.recordButton.disabled = false;
    this.recordButton.setAttribute('title', 'Bắt đầu ghi âm');
  }

  private async processAudio(audioBlob: Blob): Promise<void> {
    if (audioBlob.size === 0) {
      this.recordingStatus.textContent =
        'Không có dữ liệu âm thanh nào được ghi lại. Vui lòng thử lại.';
      this.enableRecordButton();
      return;
    }

    try {
      URL.createObjectURL(audioBlob);

      this.recordingStatus.textContent = 'Đang chuyển đổi âm thanh...';

      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const base64data = reader.result;
            if (typeof base64data !== 'string') {
              return reject(
                new Error('FileReader result was not a string.'),
              );
            }
            const base64AudioData = base64data.split(',')[1];
            resolve(base64AudioData);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(audioBlob);
      });
      
      if (!base64Audio) {
        throw new Error('Không thể chuyển đổi âm thanh sang base64');
      }

      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      await this.getTranscription(base64Audio, mimeType);
    } catch (error) {
      console.error('Lỗi trong processAudio:', error);
      this.recordingStatus.textContent =
        'Lỗi xử lý bản ghi. Vui lòng thử lại.';
      this.enableRecordButton();
    }
  }

  private async getTranscription(
    base64Audio: string,
    mimeType: string,
  ): Promise<void> {
    try {
      this.recordingStatus.textContent = 'Đang lấy bản phiên âm...';

      const contents = [
        {text: 'Tạo một bản phiên âm đầy đủ, chi tiết của đoạn âm thanh này.'},
        {inlineData: {mimeType: mimeType, data: base64Audio}},
      ];

      const response: GenerateContentResponse = await this.genAI.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
      });

      const transcriptionText = response.text;

      if (transcriptionText) {
        this.rawTranscription.textContent = transcriptionText;
        if (transcriptionText.trim() !== '') {
          this.rawTranscription.classList.remove('placeholder-active');
        } else {
          const placeholder =
            this.rawTranscription.getAttribute('placeholder') || '';
          this.rawTranscription.textContent = placeholder;
          this.rawTranscription.classList.add('placeholder-active');
        }

        if (this.currentNote)
          this.currentNote.rawTranscription = transcriptionText;
        
        this.processTranscriptionAndPolish(transcriptionText).catch((err) => {
            console.error('Lỗi xử lý bản phiên âm:', err);
            this.recordingStatus.textContent = 'Lỗi xử lý bản phiên âm.';
            this.enableRecordButton();
        });
      } else {
        this.recordingStatus.textContent =
          'Phiên âm thất bại hoặc trống.';
        this.polishedNote.innerHTML =
          '<p><em>Không thể phiên âm âm thanh. Vui lòng thử lại.</em></p>';
        this.rawTranscription.textContent =
          this.rawTranscription.getAttribute('placeholder');
        this.rawTranscription.classList.add('placeholder-active');
        this.enableRecordButton();
      }
    } catch (error) {
      console.error('Lỗi lấy bản phiên âm:', error);
      this.recordingStatus.textContent =
        'Lỗi lấy bản phiên âm. Vui lòng thử lại.';
      this.polishedNote.innerHTML = `<p><em>Lỗi trong quá trình phiên âm: ${error instanceof Error ? error.message : String(error)}</em></p>`;
      this.rawTranscription.textContent =
        this.rawTranscription.getAttribute('placeholder');
      this.rawTranscription.classList.add('placeholder-active');
      this.enableRecordButton();
    }
  }

  private async processTranscriptionAndPolish(transcription: string): Promise<void> {
    try {
        if (!transcription || transcription.trim() === '' || this.rawTranscription.classList.contains('placeholder-active')) {
            this.recordingStatus.textContent = 'Không có bản phiên âm để sửa';
            this.polishedNote.innerHTML = '<p><em>Không có bản phiên âm nào để sửa.</em></p>';
            const placeholder = this.polishedNote.getAttribute('placeholder') || '';
            this.polishedNote.innerHTML = placeholder;
            this.polishedNote.classList.add('placeholder-active');
            this.enableRecordButton();
            return;
        }

        this.recordingStatus.textContent = 'Đang xác định ngôn ngữ...';
        const langDetectPrompt = `Is the following text primarily in English or Vietnamese? Answer with only the word "English" or "Vietnamese".\n\nText: "${transcription.substring(0, 500)}"`;
        const langResponse = await this.genAI.models.generateContent({
            model: MODEL_NAME,
            contents: [{ text: langDetectPrompt }],
        });
        const detectedLanguage = langResponse.text.trim().toLowerCase();

        let polishedText: string | null = null;

        if (detectedLanguage.includes('english')) {
            this.recordingStatus.textContent = 'Phát hiện tiếng Anh. Đang sửa ghi chép...';
            const polishEnglishPrompt = `Based on this raw transcript, create a well-formatted and edited note in English. Remove filler words, repeated words, and unfinished sentences. Correctly format lists or bullet points using markdown. Retain the full original content and meaning.\n\nRaw Transcript:\n${transcription}`;
            const polishResponse = await this.genAI.models.generateContent({
                model: MODEL_NAME,
                contents: [{ text: polishEnglishPrompt }],
            });
            const polishedEnglishNote = polishResponse.text;

            if (!polishedEnglishNote || polishedEnglishNote.trim() === '') {
                throw new Error("Polishing English note returned empty content.");
            }

            this.recordingStatus.textContent = 'Đang dịch ghi chép sang tiếng Việt...';
            const translatePrompt = `Translate the following English markdown text to Vietnamese. Preserve all markdown formatting (headings, lists, bold, etc.) perfectly. Output only the translated Vietnamese text.\n\nEnglish Markdown Text:\n${polishedEnglishNote}`;
            const translateResponse = await this.genAI.models.generateContent({
                model: MODEL_NAME,
                contents: [{ text: translatePrompt }],
            });
            polishedText = translateResponse.text;
        } else {
            this.recordingStatus.textContent = 'Đang sửa ghi chép...';
            const polishVietnamesePrompt = `Dựa vào bản phiên âm thô này, hãy tạo một ghi chép đã được chỉnh sửa và định dạng tốt. Loại bỏ các từ đệm (ừm, ờ, kiểu như), các từ lặp lại và các câu nói dang dở. Định dạng đúng bất kỳ danh sách hoặc gạch đầu dòng nào. Sử dụng định dạng markdown cho tiêu đề, danh sách, v.v. Giữ lại toàn bộ nội dung và ý nghĩa ban đầu.\n\nBản phiên âm thô:\n${transcription}`;
            const polishResponse = await this.genAI.models.generateContent({
                model: MODEL_NAME,
                contents: [{ text: polishVietnamesePrompt }],
            });
            polishedText = polishResponse.text;
        }

        if (polishedText && polishedText.trim() !== '') {
            await this.updatePolishedNoteUI(polishedText);
            if (detectedLanguage.includes('english')) {
                this.recordingStatus.textContent = 'Ghi chép đã được trau chuốt và dịch. Sẵn sàng cho bản ghi tiếp theo.';
            } else {
                this.recordingStatus.textContent = 'Ghi chép đã được trau chuốt. Sẵn sàng cho bản ghi tiếp theo.';
            }
            this.saveCurrentNoteToHistory();
            this.enableRecordButton();
        } else {
            this.recordingStatus.textContent = 'Sửa ghi chép thất bại hoặc trống.';
            this.polishedNote.innerHTML = '<p><em>Việc sửa ghi chép trả về kết quả trống. Bản nháp phiên âm vẫn có sẵn.</em></p>';
            if (this.polishedNote.textContent?.trim() === '' || this.polishedNote.innerHTML.includes('<em>Việc sửa ghi chép trả về kết quả trống')) {
                const placeholder = this.polishedNote.getAttribute('placeholder') || '';
                this.polishedNote.innerHTML = placeholder;
                this.polishedNote.classList.add('placeholder-active');
            }
            this.enableRecordButton();
        }
    } catch (error) {
        console.error('Lỗi xử lý ghi chép:', error);
        this.recordingStatus.textContent = 'Lỗi xử lý ghi chép. Vui lòng thử lại.';
        this.polishedNote.innerHTML = `<p><em>Lỗi trong quá trình xử lý: ${error instanceof Error ? error.message : String(error)}</em></p>`;
        if (this.polishedNote.textContent?.trim() === '' || this.polishedNote.innerHTML.includes('<em>Lỗi trong quá trình xử lý')) {
            const placeholder = this.polishedNote.getAttribute('placeholder') || '';
            this.polishedNote.innerHTML = placeholder;
            this.polishedNote.classList.add('placeholder-active');
        }
        this.enableRecordButton();
    }
  }

  private async updatePolishedNoteUI(polishedText: string): Promise<void> {
    const htmlContent = await marked.parse(polishedText);
    this.polishedNote.innerHTML = htmlContent as string;
    if (polishedText.trim() !== '') {
        this.polishedNote.classList.remove('placeholder-active');
    } else {
        const placeholder = this.polishedNote.getAttribute('placeholder') || '';
        this.polishedNote.innerHTML = placeholder;
        this.polishedNote.classList.add('placeholder-active');
    }

    let noteTitleSet = false;
    const lines = polishedText.split('\n').map((l) => l.trim());

    for (const line of lines) {
        if (line.startsWith('#')) {
            const title = line.replace(/^#+\s+/, '').trim();
            if (this.editorTitle && title) {
                this.editorTitle.textContent = title;
                this.editorTitle.classList.remove('placeholder-active');
                noteTitleSet = true;
                break;
            }
        }
    }

    if (!noteTitleSet && this.editorTitle) {
        for (const line of lines) {
            if (line.length > 0) {
                let potentialTitle = line.replace(/^[\*_\`#\->\s\[\]\(.\d)]+/, '');
                potentialTitle = potentialTitle.replace(/[\*_\`#]+$/, '');
                potentialTitle = potentialTitle.trim();

                if (potentialTitle.length > 3) {
                    const maxLength = 60;
                    this.editorTitle.textContent =
                        potentialTitle.substring(0, maxLength) +
                        (potentialTitle.length > maxLength ? '...' : '');
                    this.editorTitle.classList.remove('placeholder-active');
                    noteTitleSet = true;
                    break;
                }
            }
        }
    }

    if (!noteTitleSet && this.editorTitle) {
        const currentEditorText = this.editorTitle.textContent?.trim();
        const placeholderText = this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
        if (currentEditorText === '' || currentEditorText === placeholderText) {
            this.editorTitle.textContent = placeholderText;
            if (!this.editorTitle.classList.contains('placeholder-active')) {
                this.editorTitle.classList.add('placeholder-active');
            }
        }
    }

    if (this.currentNote) {
      this.currentNote.polishedNote = polishedText;
    }
  }
  
  private toggleHistoryModal(show: boolean): void {
    if (show) {
        this.renderHistoryList();
        this.historyModal.classList.remove('hidden');
    } else {
        this.historyModal.classList.add('hidden');
    }
  }

  private toggleGuideModal(show: boolean): void {
    if (show) {
        this.guideModal.classList.remove('hidden');
    } else {
        this.guideModal.classList.add('hidden');
    }
  }

  private loadHistory(): void {
    const savedHistory = localStorage.getItem('voiceNotesHistory');
    if (savedHistory) {
        try {
            this.notesHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error('Lỗi phân tích lịch sử ghi chép:', e);
            this.notesHistory = [];
        }
    }
  }

  private saveHistory(): void {
    localStorage.setItem('voiceNotesHistory', JSON.stringify(this.notesHistory));
  }
  
  private saveCurrentNoteToHistory(): void {
    if (!this.currentNote) return;

    // Đồng bộ hóa tiêu đề từ DOM. raw/polished đã có trong đối tượng ghi chép.
    const placeholderTitle = this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
    const currentUITitle = this.editorTitle.textContent?.trim() || '';
    if (currentUITitle && currentUITitle !== placeholderTitle) {
        this.currentNote.title = currentUITitle;
    } else if (!this.currentNote.title) {
        // Nếu đối tượng ghi chép chưa có tiêu đề và giao diện trống, hãy tạo một tiêu đề
        this.currentNote.title = `Ghi chép ngày ${new Date(this.currentNote.timestamp).toLocaleDateString('vi-VN')}`;
    }

    // Kiểm tra nội dung và lưu
    if (this.currentNote.rawTranscription.trim() !== '' || this.currentNote.polishedNote.trim() !== '') {
        this.saveNoteToHistory(this.currentNote);
    }
  }

  private saveNoteToHistory(note: Note): void {
    const existingIndex = this.notesHistory.findIndex(n => n.id === note.id);
    if (existingIndex > -1) {
        this.notesHistory[existingIndex] = note;
    } else {
        this.notesHistory.unshift(note);
    }
    this.saveHistory();
  }

  private renderHistoryList(): void {
    this.historyList.innerHTML = '';
    if (this.notesHistory.length === 0) {
        this.historyList.innerHTML = `
            <li class="empty-history">
                <i class="fas fa-history"></i>
                <p>Chưa có ghi chép nào trong lịch sử.</p>
            </li>
        `;
        return;
    }

    this.notesHistory.forEach(note => {
        const noteItem = document.createElement('li');
        noteItem.className = 'history-item';
        noteItem.dataset.noteId = note.id;

        const date = new Date(note.timestamp);
        const formattedDate = `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

        noteItem.innerHTML = `
            <div class="history-item-info">
                <div class="history-item-title">${note.title || 'Ghi chép không có tiêu đề'}</div>
                <div class="history-item-date">${formattedDate}</div>
            </div>
            <div class="history-item-actions">
                <button class="delete-history-btn" title="Xóa ghi chép">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        
        noteItem.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.delete-history-btn')) {
                return;
            }
            this.loadNoteFromHistory(note.id);
        });

        const deleteBtn = noteItem.querySelector('.delete-history-btn');
        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.confirm('Bạn có chắc muốn xóa ghi chép này không?')) {
                this.deleteNoteFromHistory(note.id);
            }
        });

        this.historyList.appendChild(noteItem);
    });
  }

  private async loadNoteFromHistory(noteId: string): Promise<void> {
    const note = this.notesHistory.find(n => n.id === noteId);
    if (!note) return;

    this.currentNote = { ...note };

    this.editorTitle.textContent = note.title;
    this.editorTitle.classList.remove('placeholder-active');

    if (note.rawTranscription) {
        this.rawTranscription.textContent = note.rawTranscription;
        this.rawTranscription.classList.remove('placeholder-active');
    } else {
        const placeholder = this.rawTranscription.getAttribute('placeholder') || '';
        this.rawTranscription.textContent = placeholder;
        this.rawTranscription.classList.add('placeholder-active');
    }

    if (note.polishedNote) {
        await this.updatePolishedNoteUI(note.polishedNote);
    } else {
        const placeholder = this.polishedNote.getAttribute('placeholder') || '';
        this.polishedNote.innerHTML = placeholder;
        this.polishedNote.classList.add('placeholder-active');
    }
    
    this.recordingStatus.textContent = 'Đã tải ghi chép từ lịch sử.';
    this.toggleHistoryModal(false);
  }

  private deleteNoteFromHistory(noteId: string): void {
    const isCurrentNote = this.currentNote?.id === noteId;
    this.notesHistory = this.notesHistory.filter(n => n.id !== noteId);
    this.saveHistory();
    this.renderHistoryList();

    if (isCurrentNote) {
        this.currentNote = null;
        this.createNewNote(false);
    }
  }

  private createNewNote(shouldSave: boolean): void {
    if (shouldSave && this.currentNote) {
        this.currentNote.rawTranscription = this.rawTranscription.classList.contains('placeholder-active') ? '' : (this.rawTranscription.textContent || '');
        
        const placeholderTitle = this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
        const currentTitle = this.editorTitle.textContent?.trim() || '';
        this.currentNote.title = (currentTitle && currentTitle !== placeholderTitle) ? currentTitle : `Ghi chép ngày ${new Date(this.currentNote.timestamp).toLocaleDateString()}`;

        if (this.currentNote.rawTranscription.trim() !== '' || this.currentNote.polishedNote.trim() !== '') {
            this.saveNoteToHistory(this.currentNote);
        }
    }
    
    this.currentNote = {
      id: `note_${Date.now()}`,
      title: '',
      rawTranscription: '',
      polishedNote: '',
      timestamp: Date.now(),
    };

    const rawPlaceholder =
      this.rawTranscription.getAttribute('placeholder') || '';
    this.rawTranscription.textContent = rawPlaceholder;
    this.rawTranscription.classList.add('placeholder-active');

    const polishedPlaceholder =
      this.polishedNote.getAttribute('placeholder') || '';
    this.polishedNote.innerHTML = polishedPlaceholder;
    this.polishedNote.classList.add('placeholder-active');

    if (this.editorTitle) {
      const placeholder =
        this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
      this.editorTitle.textContent = placeholder;
      this.editorTitle.classList.add('placeholder-active');
    }
    this.recordingStatus.textContent = 'Sẵn sàng ghi âm';

    if (this.isRecording) {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      this.recordButton.classList.remove('recording');
    } else {
      this.stopLiveDisplay();
    }
  }

  private async downloadAsDocx(): Promise<void> {
    const { Packer, Document, Paragraph, TextRun, HeadingLevel, PageBreak } = docx;

    const placeholderTitle = this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
    const currentEditorNote: Note = {
        id: this.currentNote?.id || `note_${Date.now()}`,
        title: (this.editorTitle.textContent?.trim() === placeholderTitle ? '' : this.editorTitle.textContent?.trim()) || '',
        polishedNote: this.polishedNote.classList.contains('placeholder-active') ? '' : this.polishedNote.innerText,
        rawTranscription: this.rawTranscription.classList.contains('placeholder-active') ? '' : (this.rawTranscription.textContent || ''),
        timestamp: this.currentNote?.timestamp || Date.now(),
    };

    const allNotesMap = new Map<string, Note>();
    this.notesHistory.forEach(note => allNotesMap.set(note.id, note));
    allNotesMap.set(currentEditorNote.id, currentEditorNote);

    const allNotes = Array.from(allNotesMap.values());

    const notesToDownload = allNotes.filter(note =>
        (note.polishedNote && note.polishedNote.trim() !== '') ||
        (note.rawTranscription && note.rawTranscription.trim() !== '')
    );

    if (notesToDownload.length === 0) {
        alert('Không có nội dung để tải xuống. Vui lòng ghi âm hoặc tạo một ghi chép trước.');
        return;
    }

    notesToDownload.sort((a, b) => a.timestamp - b.timestamp);

    const docChildren: docx.Paragraph[] = [];

    notesToDownload.forEach((note, index) => {
        const title = note.title || 'Ghi chép không có tiêu đề';
        const date = new Date(note.timestamp);
        const formattedDate = `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: title, bold: true, size: 32 })],
                heading: HeadingLevel.HEADING_1,
                spacing: { after: 200 },
            })
        );
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: formattedDate, italics: true, size: 22, color: "888888" })],
                spacing: { after: 400 },
            })
        );

        const polishedNoteContent = note.polishedNote?.trim();
        if (polishedNoteContent) {
            docChildren.push(
                new Paragraph({
                    text: 'Ghi chép đã trau chuốt',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 150 },
                })
            );
            polishedNoteContent.split('\n').filter(line => line.trim() !== '').forEach(line => {
                docChildren.push(new Paragraph({ text: line, spacing: { after: 100 } }));
            });
        }

        const rawTranscriptionContent = note.rawTranscription?.trim();
        if (rawTranscriptionContent) {
            docChildren.push(
                new Paragraph({
                    text: 'Ghi chép nguyên văn',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 400, after: 150 },
                })
            );
            rawTranscriptionContent.split('\n').filter(line => line.trim() !== '').forEach(line => {
                docChildren.push(new Paragraph({ text: line, spacing: { after: 100 } }));
            });
        }

        if (index < notesToDownload.length - 1) {
            docChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }
    });

    const doc = new Document({
        sections: [{
            properties: {},
            children: docChildren,
        }],
    });

    try {
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const filename = `toan_bo_ghi_chep_${new Date().toISOString().split('T')[0]}.docx`;
        a.download = filename;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Lỗi tạo file DOCX:", error);
        alert("Đã xảy ra lỗi khi tạo tệp DOCX. Vui lòng thử lại.");
    }
  }

  // AI Chat Methods
  private toggleAiChatModal(show: boolean): void {
    if (show) {
        this.initializeAiChat();
        this.aiChatModal.classList.remove('hidden');
        this.chatInput.focus();
    } else {
        this.aiChatModal.classList.add('hidden');
        this.removeAttachment();
        if (this.isListening) this.recognition?.stop();
        this.chat = null; // Reset chat session
    }
  }

  private initializeAiChat(): void {
    this.chatMessages.innerHTML = '';

    // Get the most up-to-date version of the note currently in the editor.
    const placeholderTitle = this.editorTitle.getAttribute('placeholder') || 'Ghi chép chưa có tiêu đề';
    const currentEditorNote: Note = {
        id: this.currentNote?.id || `note_${Date.now()}`,
        title: (this.editorTitle.textContent?.trim() === placeholderTitle ? '' : this.editorTitle.textContent?.trim()) || '',
        polishedNote: this.polishedNote.classList.contains('placeholder-active') ? '' : this.polishedNote.innerText,
        rawTranscription: this.rawTranscription.classList.contains('placeholder-active') ? '' : (this.rawTranscription.textContent || ''),
        timestamp: this.currentNote?.timestamp || Date.now(),
    };

    const allNotesMap = new Map<string, Note>();
    // Add all notes from history to the map.
    this.notesHistory.forEach(note => allNotesMap.set(note.id, note));

    // Add/overwrite with the current editor note to ensure it's the latest version.
    allNotesMap.set(currentEditorNote.id, currentEditorNote);
    
    // Convert map to array and sort chronologically (oldest first)
    const sortedNotes = Array.from(allNotesMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    let context = '';
    if (sortedNotes.length > 0) {
        context = sortedNotes
            .map(note => {
                // To avoid sending totally empty notes to the context
                if (!note.title && !note.polishedNote && !note.rawTranscription) {
                    return '';
                }
                return `
--- Ghi chép bắt đầu ---
Tiêu đề: ${note.title || 'Ghi chép không có tiêu đề'}
Ngày: ${new Date(note.timestamp).toLocaleString('vi-VN')}

Nội dung đã trau chuốt:
${note.polishedNote || "Chưa có"}

Nội dung phiên âm thô:
${note.rawTranscription || "Chưa có"}
--- Ghi chép kết thúc ---
            `})
            .join('\n\n').trim();
        
        this.addMessageToChatUI('Xin chào! Tôi có thể giúp gì với các ghi chép của bạn?', 'ai');
    } else {
        this.addMessageToChatUI('Xin chào! Hiện tại bạn chưa có ghi chép nào để trò chuyện. Hãy ghi âm điều gì đó hoặc hỏi tôi một câu hỏi chung!', 'ai');
    }

    const systemInstruction = `Bạn là một trợ lý AI hữu ích chuyên phân tích các ghi chép giọng nói và trò chuyện với người dùng.
Nếu người dùng cung cấp ghi chép, nhiệm vụ của bạn là trả lời các câu hỏi của người dùng CHỈ dựa trên thông tin có trong các ghi chép này. Không sử dụng bất kỳ kiến thức bên ngoài nào trừ khi được yêu cầu rõ ràng. Nếu câu trả lời không có trong ghi chép, hãy nói rằng bạn không thể tìm thấy thông tin trong các ghi chép được cung cấp.
Bạn cũng có thể nhận được các tệp như hình ảnh, PDF hoặc tài liệu DOCX. Nếu người dùng cung cấp một tệp, bạn có thể phân tích nội dung của nó, trả lời các câu hỏi về nó, hoặc sử dụng nó làm ngữ cảnh cho cuộc trò chuyện.
Luôn trả lời bằng tiếng Việt.

Đây là các ghi chép (nếu có) theo thứ tự thời gian:\n\n${context}`;

    this.chat = this.genAI.chats.create({
        model: MODEL_NAME,
        config: {
            systemInstruction: systemInstruction,
        },
    });
  }

  private async addMessageToChatUI(message: string, sender: 'user' | 'ai', options: { isThinking?: boolean; attachment?: AttachedFile } = {}): Promise<HTMLElement> {
      const { isThinking = false, attachment } = options;
      const messageContainer = document.createElement('div');
      messageContainer.className = `chat-message ${sender}-message`;

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.innerHTML = `<i class="fas ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i>`;

      const content = document.createElement('div');
      content.className = 'message-content';

      if (attachment) {
          if (attachment.mimeType.startsWith('image/')) {
              const img = document.createElement('img');
              img.src = attachment.url;
              img.alt = attachment.name;
              content.appendChild(img);
          } else {
              let iconClass = 'fa-file-alt';
              if (attachment.mimeType === 'application/pdf') {
                  iconClass = 'fa-file-pdf';
              } else if (attachment.mimeType.includes('wordprocessingml')) {
                  iconClass = 'fa-file-word';
              }
              const fileDisplay = document.createElement('div');
              fileDisplay.className = 'attachment-in-message';
              fileDisplay.innerHTML = `<i class="fas ${iconClass}"></i><span>${attachment.name}</span>`;
              content.appendChild(fileDisplay);
          }
      }

      if (isThinking) {
          content.innerHTML += `<div class="thinking-indicator"><span></span><span></span><span></span></div>`;
      } else {
          content.innerHTML += sender === 'ai' ? await marked.parse(message) : message.replace(/\n/g, '<br>');
      }

      messageContainer.appendChild(avatar);
      messageContainer.appendChild(content);

      this.chatMessages.appendChild(messageContainer);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

      return messageContainer;
  }

    private createChatDownloadButton(text: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'chat-download-btn';
        button.title = 'Tải xuống dưới dạng DOCX';
        button.innerHTML = '<i class="fas fa-file-word"></i>';
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadSingleMessageAsDocx(text);
        });
        return button;
    }

    private async downloadSingleMessageAsDocx(text: string): Promise<void> {
        const { Packer, Document, Paragraph } = docx;

        if (!text || text.trim() === '') {
            alert('Không có nội dung để tải xuống.');
            return;
        }

        try {
            const doc = new Document({
                sections: [{
                    properties: {},
                    children: text.split('\n').map(line => new Paragraph({ text: line })),
                }],
            });

            const blob = await Packer.toBlob(doc);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const filename = `phan_hoi_cua_ai_${new Date().getTime()}.docx`;
            a.download = filename;
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Lỗi tạo file DOCX:", error);
            alert("Đã xảy ra lỗi khi tạo tệp DOCX. Vui lòng thử lại.");
        }
    }
  
  private async handleSendMessage(): Promise<void> {
    const messageText = this.chatInput.value.trim();
    if ((!messageText && !this.attachedFile) || !this.chat || this.sendChatButton.disabled) return;

    this.sendChatButton.disabled = true;
    this.chatInput.disabled = true;
    this.voiceInputButton.disabled = true;
    this.attachFileButton.disabled = true;

    const parts: Part[] = [];
    let attachmentForUI: AttachedFile | undefined;

    if (this.attachedFile) {
        parts.push({
            inlineData: {
                mimeType: this.attachedFile.mimeType,
                data: this.attachedFile.data,
            }
        });
        attachmentForUI = this.attachedFile;
    }

    if (messageText) {
        parts.push({ text: messageText });
    }
    
    this.addMessageToChatUI(messageText, 'user', { attachment: attachmentForUI });
    this.chatInput.value = '';
    this.removeAttachment();

    const aiMessageContainer = await this.addMessageToChatUI('', 'ai', { isThinking: true });
    const contentElement = aiMessageContainer.querySelector('.message-content') as HTMLElement;

    try {
        const responseStream = await this.chat.sendMessageStream({ message: parts });
        let responseText = '';
        
        contentElement.innerHTML = ''; 

        for await (const chunk of responseStream) {
            responseText += chunk.text;
            contentElement.innerHTML = await marked.parse(responseText);
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
        
        if (responseText.trim()) {
            const downloadBtn = this.createChatDownloadButton(responseText);
            aiMessageContainer.appendChild(downloadBtn);
        }

    } catch (error) {
        console.error('Lỗi gửi tin nhắn trò chuyện:', error);
        contentElement.innerHTML = `<p><em>Rất tiếc, đã xảy ra lỗi. Vui lòng thử lại.</em></p>`;
    } finally {
        this.sendChatButton.disabled = false;
        this.chatInput.disabled = false;
        this.voiceInputButton.disabled = false;
        this.attachFileButton.disabled = false;
        this.chatInput.focus();
    }
  }

  // New Chat Features
  private handleFileSelect(event: Event): void {
      const input = event.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) return;
      
      const file = input.files[0];
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      if (!isImage && !isPdf && !isDocx) {
          alert('Vui lòng chọn tệp hình ảnh, PDF hoặc DOCX.');
          input.value = ''; // Reset input
          return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
          const dataUrl = reader.result as string;
          this.attachedFile = {
              name: file.name,
              mimeType: file.type,
              data: dataUrl.split(',')[1],
              url: dataUrl
          };
          this.renderAttachmentPreview();
      };
      reader.readAsDataURL(file);
      
      // Reset input to allow selecting the same file again
      input.value = '';
  }

  private renderAttachmentPreview(): void {
      this.attachmentPreviewContainer.innerHTML = '';
      if (!this.attachedFile) return;

      const preview = document.createElement('div');
      preview.className = 'attachment-preview';
      
      let iconClass = 'fa-file-alt'; // A default file icon
      if (this.attachedFile.mimeType.startsWith('image/')) {
          iconClass = 'fa-file-image';
      } else if (this.attachedFile.mimeType === 'application/pdf') {
          iconClass = 'fa-file-pdf';
      } else if (this.attachedFile.mimeType.includes('wordprocessingml')) {
          iconClass = 'fa-file-word';
      }
      
      preview.innerHTML = `
          <div class="attachment-preview-icon">
             <i class="fas ${iconClass}"></i>
          </div>
          <span class="attachment-preview-info">${this.attachedFile.name}</span>
          <button class="attachment-preview-remove" title="Xóa tệp đính kèm">&times;</button>
      `;
      
      preview.querySelector('.attachment-preview-remove')?.addEventListener('click', () => {
          this.removeAttachment();
      });

      this.attachmentPreviewContainer.appendChild(preview);
  }

  private removeAttachment(): void {
      this.attachedFile = null;
      this.renderAttachmentPreview();
  }

  private initSpeechRecognition(): void {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = false;
          this.recognition.lang = 'vi-VN';
          this.recognition.interimResults = false;
          this.recognition.maxAlternatives = 1;

          this.recognition.onresult = this.handleVoiceResult.bind(this);
          this.recognition.onstart = this.handleVoiceStart.bind(this);
          this.recognition.onend = this.handleVoiceEnd.bind(this);
          this.recognition.onerror = this.handleVoiceError.bind(this);
      } else {
          console.warn('Speech Recognition không được hỗ trợ trên trình duyệt này.');
          this.voiceInputButton.style.display = 'none';
      }
  }
  
  private toggleVoiceInput(): void {
      if (!this.recognition) return;
      if (this.isListening) {
          this.recognition.stop();
      } else {
          this.recognition.start();
      }
  }

  private handleVoiceStart(): void {
      this.isListening = true;
      this.voiceInputButton.classList.add('listening');
      this.voiceInputButton.title = 'Dừng lắng nghe';
  }

  private handleVoiceEnd(): void {
      this.isListening = false;
      this.voiceInputButton.classList.remove('listening');
      this.voiceInputButton.title = 'Nhập bằng giọng nói';
  }

  private handleVoiceError(event: SpeechRecognitionErrorEvent): void {
      console.error('Lỗi nhận dạng giọng nói:', event.error);
      this.handleVoiceEnd(); // Reset UI
  }

  private handleVoiceResult(event: SpeechRecognitionEvent): void {
      const transcript = event.results[0][0].transcript;
      this.chatInput.value = transcript;
      this.chatInput.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoiceNotesApp();

  document
    .querySelectorAll<HTMLElement>('[contenteditable][placeholder]')
    .forEach((el) => {
      const placeholder = el.getAttribute('placeholder')!;

      function updatePlaceholderState() {
        const currentText = (
          el.id === 'polishedNote' ? el.innerText : el.textContent
        )?.trim();

        if (currentText === '' || currentText === placeholder) {
          if (el.id === 'polishedNote' && currentText === '') {
            el.innerHTML = placeholder;
          } else if (currentText === '') {
            el.textContent = placeholder;
          }
          el.classList.add('placeholder-active');
        } else {
          el.classList.remove('placeholder-active');
        }
      }

      updatePlaceholderState();

      el.addEventListener('focus', function () {
        const currentText = (
          this.id === 'polishedNote' ? this.innerText : this.textContent
        )?.trim();
        if (currentText === placeholder) {
          if (this.id === 'polishedNote') this.innerHTML = '';
          else this.textContent = '';
          this.classList.remove('placeholder-active');
        }
      });

      el.addEventListener('blur', function () {
        updatePlaceholderState();
      });
    });
});

export {};