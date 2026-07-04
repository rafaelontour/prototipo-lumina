export type Severity = "low" | "medium" | "high";

export type Feedback = {
  id: string;
  page: number;
  text: string;
  severity: Severity;
  category: string;
  excerpt?: string;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  feedbacks?: Feedback[];
  analysisScore?: {
    value: number;
    max: number;
    label: string;
    tone: "low" | "medium" | "high";
  };
  analysisTopics?: Array<{
    title: string;
    description: string;
    items: Array<{
      title: string;
      status: string;
      score: number;
      feedback: string;
    }>;
  }>;
};

export type DocumentRecord = {
  id: string;
  name: string;
  createdAt: string;
  pages: string[];
  pageCount: number;
  feedbacks: Feedback[];
  summary: {
    general: string[];
    quality: string[];
    priorities: string[];
  };
  messages: ChatMessage[];
};

export type PublicDocumentRecord = Omit<DocumentRecord, "pages"> & {
  pdfUrl: string;
};
