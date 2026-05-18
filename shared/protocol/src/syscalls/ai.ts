export type AiTranscriptionCreateArgs = {
  audio: {
    data: string;
    mimeType: string;
    filename?: string;
    size?: number;
  };
  language?: string;
  prompt?: string;
  mode?: "transcribe" | "translate";
};

export type AiTranscriptionCreateResult = {
  text: string;
  language?: string;
  duration?: number;
  segments?: unknown[];
  provider: string;
  model: string;
};

