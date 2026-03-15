export interface LLMProvider {
  readonly name: string;
  generate(content: string, options: GenerateOptions): Promise<LLMResult>;
  adapt(content: string, options: AdaptOptions): Promise<LLMResult>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  template?: string;
  templateVars?: Record<string, string>;
}

export interface AdaptOptions {
  platform: string;
  temperature?: number;
  maxTokens?: number;
  template?: string;
  templateVars?: Record<string, string>;
}

export interface LLMResult {
  content: string;
  model: string;
  provider: string;
  tokenUsage: {
    prompt: number;
    completion: number;
  };
}

export const PLATFORM_PROMPTS: Record<string, string> = {
  x: 'Rewrite this into a high-engagement Twitter/X thread. Separate each tweet with --- on its own line. Each tweet must be under 280 characters.',
  wechat: 'Rewrite this into a formal, structured WeChat article with clear sections and professional tone.',
  zhihu: 'Rewrite this into a deep-dive, professional Zhihu answer with analysis and personal insights.',
  devto: 'Rewrite this into a well-structured Dev.to article with code examples, headings, and a clear introduction.',
  hashnode: 'Rewrite this into an engaging Hashnode blog post with SEO-friendly headings and takeaways.',
};

export const DEFAULT_DRAFT_PROMPT = 'You are an expert content strategist. Expand the following idea into a comprehensive, high-quality long-form article. Output in Markdown format.';
