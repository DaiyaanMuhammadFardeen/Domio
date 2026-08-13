/**
 * Domio prompt template registry — versioned, eval-linked prompt templates.
 *
 * Per docs/ai-copilot.md §4.6, the registry holds all 14 prompt templates
 * used by the AI Copilot pipelines. Each template is immutable once published;
 * version bumps follow semantic versioning conventions documented in JSDoc.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single prompt template in the registry.
 *
 * Templates are immutable once published. To create a new version, add a new
 * entry with an incremented `version` and keep the old entry for backward
 * compatibility. Consumers can pin to a specific version or use the latest.
 */
export interface PromptTemplate {
  /** Unique template identifier, e.g. "outline.from_prompt". */
  id: string;

  /** Semantic version number. Starts at 1. Increment on changes. */
  version: number;

  /** Model class hint (e.g. "openai/gpt-5.2-high", "vllm/qwen2.5-72b"). */
  modelClassHint: string;

  /** JSON Schema describing expected input fields. */
  inputSchema: Record<string, unknown>;

  /** JSON Schema describing output fields. */
  outputSchema: Record<string, unknown>;

  /** Eval set ID for regression testing (naming convention: eval-<template-id>-v<N>). */
  evalSetId?: string;

  /** The system prompt that sets the model's behavior. */
  systemPrompt: string;

  /**
   * The user-facing prompt template with {placeholder} variables.
   * Placeholders must correspond to keys in `inputSchema` properties.
   */
  userPromptTemplate: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a template is not found by ID (and optionally version). */
export class TemplateNotFoundError extends Error {
  public readonly availableIds: string[];

  constructor(id: string, availableIds: string[]) {
    super(`Template "${id}" not found. Available templates: ${availableIds.join(', ')}`);
    this.name = 'TemplateNotFoundError';
    this.availableIds = availableIds;
  }
}

// ---------------------------------------------------------------------------
// TEMPLATES — all 14 prompt templates
// ---------------------------------------------------------------------------

/**
 * The canonical registry of all prompt templates.
 *
 * Each template is a `PromptTemplate` with:
 * - `id`: matches the §4.6 identifier
 * - `version`: starts at 1
 * - `modelClassHint`: plausible model class for the task
 * - `inputSchema` / `outputSchema`: JSON Schema objects
 * - `systemPrompt`: production-quality system prompt
 * - `userPromptTemplate`: prompt with {placeholders}
 * - `evalSetId`: naming convention `eval-<id>-v<version>`
 */
export const TEMPLATES: PromptTemplate[] = [
  // -------------------------------------------------------------------------
  // 1. outline.from_prompt
  // -------------------------------------------------------------------------
  {
    id: 'outline.from_prompt',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'User&apos;s free-text description of the desired presentation.',
        },
        audience: {
          type: 'string',
          description: 'Target audience (e.g. "board", "technical", "sales").',
        },
        slideCount: { type: 'number', description: 'Desired number of slides.' },
        tone: {
          type: 'string',
          description: 'Desired tone (e.g. "formal", "playful", "optimistic").',
        },
        brandContext: { type: 'string', description: 'Optional brand guidelines or context.' },
      },
      required: ['prompt'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slideNumber: { type: 'number' },
              title: { type: 'string' },
              intent: { type: 'string' },
              layoutHint: { type: 'string' },
              contentBlocks: { type: 'array', items: { type: 'string' } },
              dataBindings: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number' },
            },
          },
        },
      },
    },
    evalSetId: 'eval-outline-from-prompt-v1',
    systemPrompt:
      `You are an expert presentation planner for Domio, a Figma-grade presentation platform. ` +
      `Your role is to create a structured, audience-aware slide outline from a free-text prompt. ` +
      `For each slide, provide a clear title, the intent (what the slide should accomplish), ` +
      `a suggested layout type (e.g. "title-and-bullets", "two-column", "chart", "full-image"), ` +
      `and a list of content blocks. Each slide must include a confidence score (0-1) indicating ` +
      `how certain you are that the slide content is well-grounded and appropriate. ` +
      `Never fabricate data — if specific data is needed, mark it as [NEEDS DATA]. ` +
      `Ensure the outline is coherent, follows a logical narrative arc, and is audience-appropriate.`,
    userPromptTemplate:
      `Create a presentation outline for the following request:\n\n` +
      `Prompt: {prompt}\n` +
      `Audience: {audience}\n` +
      `Number of slides: {slideCount}\n` +
      `Tone: {tone}\n` +
      `Brand context: {brandContext}`,
  },

  // -------------------------------------------------------------------------
  // 2. outline.from_doc
  // -------------------------------------------------------------------------
  {
    id: 'outline.from_doc',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        documentText: { type: 'string', description: 'Extracted text from the source document.' },
        documentTitle: { type: 'string', description: 'Title of the source document.' },
        audience: { type: 'string', description: 'Target audience.' },
        slideCount: { type: 'number', description: 'Desired number of slides.' },
        tone: { type: 'string', description: 'Desired tone.' },
      },
      required: ['documentText'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        sourceDocument: { type: 'string' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slideNumber: { type: 'number' },
              title: { type: 'string' },
              intent: { type: 'string' },
              layoutHint: { type: 'string' },
              contentBlocks: { type: 'array', items: { type: 'string' } },
              citationRefs: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number' },
            },
          },
        },
      },
    },
    evalSetId: 'eval-outline-from-doc-v1',
    systemPrompt:
      `You are an expert document-to-presentation planner for Domio. ` +
      `Your task is to extract the most important information from a document ` +
      `and structure it into a coherent slide presentation. ` +
      `Every claim on a generated slide MUST include a citation reference (citationRef) ` +
      `pointing back to the source text. If a claim cannot be cited, mark it as [NEEDS CITATION]. ` +
      `Preserve the document's factual accuracy — do not paraphrase in a way that changes meaning. ` +
      `Suggest appropriate layouts for each slide based on content type.`,
    userPromptTemplate:
      `Create a presentation outline from the following document:\n\n` +
      `Document Title: {documentTitle}\n` +
      `Audience: {audience}\n` +
      `Number of slides: {slideCount}\n` +
      `Tone: {tone}\n\n` +
      `Document Content:\n{documentText}`,
  },

  // -------------------------------------------------------------------------
  // 3. outline.from_data
  // -------------------------------------------------------------------------
  {
    id: 'outline.from_data',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        findings: { type: 'string', description: 'Structured findings from statistical analysis.' },
        analysisIntent: { type: 'string', description: 'The user stated analysis intent.' },
        audience: { type: 'string', description: 'Target audience.' },
        slideCount: { type: 'number', description: 'Desired number of slides.' },
        tone: { type: 'string', description: 'Desired tone.' },
      },
      required: ['findings'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slideNumber: { type: 'number' },
              title: { type: 'string' },
              intent: { type: 'string' },
              layoutHint: { type: 'string' },
              chartType: { type: 'string' },
              dataBindings: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number' },
            },
          },
        },
      },
    },
    evalSetId: 'eval-outline-from-data-v1',
    systemPrompt:
      `You are an expert data-storytelling planner for Domio. ` +
      `Your task is to turn statistical findings into a compelling narrative presentation. ` +
      `For each slide, specify which finding drives it, the recommended chart type ` +
      `(line, bar, pie, scatter, table, etc.), and the data bindings that should be used. ` +
      `The story arc should follow: Setup → Key Findings → Deep Dives → Recommendations. ` +
      `Never paste raw numbers — bind them to underlying queries. ` +
      `Include a confidence score per slide reflecting data quality.`,
    userPromptTemplate:
      `Create a data-storytelling presentation outline:\n\n` +
      `Analysis Intent: {analysisIntent}\n` +
      `Audience: {audience}\n` +
      `Number of slides: {slideCount}\n` +
      `Tone: {tone}\n\n` +
      `Statistical Findings:\n{findings}`,
  },

  // -------------------------------------------------------------------------
  // 4. slide.design
  // -------------------------------------------------------------------------
  {
    id: 'slide.design',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        slideDescription: {
          type: 'string',
          description: 'Description of what the slide should convey.',
        },
        layoutHint: { type: 'string', description: 'Suggested layout type.' },
        brandTokens: { type: 'string', description: 'Brand color palette, fonts, and style.' },
        referenceImageUrl: { type: 'string', description: 'Optional reference image URL.' },
      },
      required: ['slideDescription'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        layouts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              layoutId: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              elements: { type: 'array' },
              reasoning: { type: 'string' },
            },
          },
        },
      },
    },
    evalSetId: 'eval-slide-design-v1',
    systemPrompt:
      `You are an expert slide designer for Domio, a Figma-grade presentation platform. ` +
      `Given a slide description, produce 4 genuinely distinct layout options. ` +
      `Each layout must be structurally different (not just color/spacing variants). ` +
      `For each layout, describe the element arrangement, typography hierarchy, ` +
      `and the design reasoning behind your choice. Respect brand tokens when provided. ` +
      `Ensure all layouts are accessible (WCAG 2.2 AA contrast, logical reading order).`,
    userPromptTemplate:
      `Design a slide with the following description:\n\n` +
      `Description: {slideDescription}\n` +
      `Suggested Layout: {layoutHint}\n` +
      `Brand Tokens: {brandTokens}\n` +
      `Reference Image: {referenceImageUrl}`,
  },

  // -------------------------------------------------------------------------
  // 5. slide.redesign
  // -------------------------------------------------------------------------
  {
    id: 'slide.redesign',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        slideContent: { type: 'string', description: 'Current slide content to redesign.' },
        mode: {
          type: 'string',
          description: 'Redesign mode: "light" (spacing/alignment) or "full" (structure change).',
        },
        brandTokens: { type: 'string', description: 'Brand guidelines.' },
      },
      required: ['slideContent', 'mode'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        redesigns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              redesignId: { type: 'string' },
              layout: { type: 'string' },
              changes: { type: 'array', items: { type: 'string' } },
              contentPreserved: { type: 'boolean' },
            },
          },
        },
      },
    },
    evalSetId: 'eval-slide-redesign-v1',
    systemPrompt:
      `You are an expert slide redesigner for Domio. ` +
      `Given existing slide content, produce redesign options that improve visual hierarchy, ` +
      `layout, typography, and brand alignment. ` +
      `CRITICAL: Content (text, data, citations) must be preserved verbatim. ` +
      `In "light" mode, focus on spacing, alignment, and typography fixes only. ` +
      `In "full" mode, you may restructure the layout while preserving all content. ` +
      `For each redesign, list the specific changes made and confirm content preservation.`,
    userPromptTemplate:
      `Redesign the following slide:\n\n` +
      `Mode: {mode}\n` +
      `Brand Tokens: {brandTokens}\n\n` +
      `Current Slide Content:\n{slideContent}`,
  },

  // -------------------------------------------------------------------------
  // 6. notes.generate
  // -------------------------------------------------------------------------
  {
    id: 'notes.generate',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        slideTitle: { type: 'string', description: 'Title of the slide.' },
        slideContent: { type: 'string', description: 'Full content of the slide.' },
        variant: {
          type: 'string',
          description: 'Notes variant: "terse", "detailed", or "executive".',
        },
        dataBindings: { type: 'string', description: 'Optional data bindings for the slide.' },
      },
      required: ['slideTitle', 'slideContent', 'variant'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        notes: { type: 'string' },
        estimatedDurationSeconds: { type: 'number' },
        variant: { type: 'string' },
      },
    },
    evalSetId: 'eval-notes-generate-v1',
    systemPrompt:
      `You are an expert speaker notes writer for Domio. ` +
      `Given a slide's content, generate speaker notes that help the presenter deliver ` +
      `the slide effectively. Notes should explain the chart or data shown, not just ` +
      `read the slide text. Stay under 90 seconds of speaking time per slide (~225 words). ` +
      `Never assert facts not on the slide without an explicit citation. ` +
      `Adapt the style to the requested variant: terse (bullet points), detailed (full script), ` +
      `or executive (key takeaways only).`,
    userPromptTemplate:
      `Generate speaker notes for the following slide:\n\n` +
      `Title: {slideTitle}\n` +
      `Variant: {variant}\n` +
      `Data Bindings: {dataBindings}\n\n` +
      `Slide Content:\n{slideContent}`,
  },

  // -------------------------------------------------------------------------
  // 7. qa.generate
  // -------------------------------------------------------------------------
  {
    id: 'qa.generate',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        slideTitle: { type: 'string', description: 'Title of the slide.' },
        slideContent: { type: 'string', description: 'Content of the slide.' },
        speakerNotes: { type: 'string', description: 'Speaker notes for the slide.' },
        audienceProfile: {
          type: 'string',
          description: 'Audience type: "board", "technical", "customer", "general".',
        },
      },
      required: ['slideTitle', 'slideContent', 'audienceProfile'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              rationale: { type: 'string' },
              suggestedAnswer: { type: 'string' },
              difficulty: { type: 'string' },
              isBoardPrep: { type: 'boolean' },
            },
          },
        },
      },
    },
    evalSetId: 'eval-qa-generate-v1',
    systemPrompt:
      `You are an expert Q&A preparation coach for Domio. ` +
      `Given a slide's content, generate likely tough questions an audience might ask. ` +
      `For each question, provide a rationale for why it might be asked, a suggested answer ` +
      `grounded in the slide content, and a difficulty rating (easy/medium/hard). ` +
      `For "board" audience profile, pre-weight financially-oriented and strategic questions. ` +
      `Suggested answers must cite the slide or pull from speaker notes — never fabricate.`,
    userPromptTemplate:
      `Generate anticipated Q&A for the following slide:\n\n` +
      `Title: {slideTitle}\n` +
      `Audience Profile: {audienceProfile}\n\n` +
      `Slide Content:\n{slideContent}\n\n` +
      `Speaker Notes:\n{speakerNotes}`,
  },

  // -------------------------------------------------------------------------
  // 8. summary.executive
  // -------------------------------------------------------------------------
  {
    id: 'summary.executive',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        deckTitle: { type: 'string', description: 'Title of the deck.' },
        slidesSummary: { type: 'string', description: 'Summarized content of all slides.' },
        audience: { type: 'string', description: 'Target audience for the summary.' },
      },
      required: ['deckTitle', 'slidesSummary'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        executiveSummary: { type: 'string' },
        keyTakeaways: { type: 'array', items: { type: 'string' } },
        recommendedActions: { type: 'array', items: { type: 'string' } },
      },
    },
    evalSetId: 'eval-summary-executive-v1',
    systemPrompt:
      `You are an expert executive summary writer for Domio. ` +
      `Given a deck's content, produce a concise executive summary that captures the ` +
      `essential points, key takeaways, and recommended actions. ` +
      `Every claim in the summary MUST be grounded in the source deck — never introduce ` +
      `new information. The summary should be faithful to the source, use the same brand ` +
      `tone, and be suitable for C-level readers who may not read the full deck. ` +
      `Keep the summary under 300 words.`,
    userPromptTemplate:
      `Create an executive summary for the following presentation:\n\n` +
      `Deck Title: {deckTitle}\n` +
      `Audience: {audience}\n\n` +
      `Slide Content Summary:\n{slidesSummary}`,
  },

  // -------------------------------------------------------------------------
  // 9. summary.tldr
  // -------------------------------------------------------------------------
  {
    id: 'summary.tldr',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        deckTitle: { type: 'string', description: 'Title of the deck.' },
        slidesSummary: { type: 'string', description: 'Summarized content of all slides.' },
        maxWords: { type: 'number', description: 'Maximum words for the TL;DR.' },
      },
      required: ['deckTitle', 'slidesSummary'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        tldr: { type: 'string' },
        oneLiner: { type: 'string' },
      },
    },
    evalSetId: 'eval-summary-tldr-v1',
    systemPrompt:
      `You are an expert TL;DR writer for Domio. ` +
      `Given a deck's content, produce a one-page TL;DR summary that can be printed ` +
      `or shown as a scrollytelling strip. The TL;DR should be scannable: ` +
      `use bullet points, bold key phrases, and keep the total under the word limit. ` +
      `Every claim MUST be grounded in the source deck. ` +
      `Also provide a single one-liner that captures the deck's core message.`,
    userPromptTemplate:
      `Create a TL;DR summary for the following presentation:\n\n` +
      `Deck Title: {deckTitle}\n` +
      `Max Words: {maxWords}\n\n` +
      `Slide Content Summary:\n{slidesSummary}`,
  },

  // -------------------------------------------------------------------------
  // 10. translate.preserve_layout
  // -------------------------------------------------------------------------
  {
    id: 'translate.preserve_layout',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to translate.' },
        targetLanguage: {
          type: 'string',
          description: 'Target language code (e.g. "es", "ja", "ar").',
        },
        sourceLanguage: {
          type: 'string',
          description: 'Source language code (auto-detect if omitted).',
        },
        glossary: { type: 'string', description: 'Workspace glossary overrides for brand terms.' },
        maxCharacters: { type: 'number', description: 'Maximum character count to fit in layout.' },
      },
      required: ['text', 'targetLanguage'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        translatedText: { type: 'string' },
        sourceLanguage: { type: 'string' },
        targetLanguage: { type: 'string' },
        fitsLayout: { type: 'boolean' },
        glossaryApplied: { type: 'array', items: { type: 'string' } },
        nuanceWarning: { type: 'string' },
      },
    },
    evalSetId: 'eval-translate-preserve-layout-v1',
    systemPrompt:
      `You are an expert translation engine for Domio, a presentation platform. ` +
      `Translate the given text while preserving meaning, tone, and formatting. ` +
      `If the translated text exceeds the character limit, suggest a shorter equivalent ` +
      `that preserves the core meaning. Apply glossary overrides for brand terms. ` +
      `For right-to-left languages, note that layout direction will be flipped. ` +
      `If the translation may lose humor, idiom, or nuance, include a nuanceWarning. ` +
      `Never translate brand names unless the glossary explicitly provides a translation.`,
    userPromptTemplate:
      `Translate the following text:\n\n` +
      `Target Language: {targetLanguage}\n` +
      `Source Language: {sourceLanguage}\n` +
      `Max Characters: {maxCharacters}\n` +
      `Glossary Overrides: {glossary}\n\n` +
      `Text:\n{text}`,
  },

  // -------------------------------------------------------------------------
  // 11. accessibility.alt_text
  // -------------------------------------------------------------------------
  {
    id: 'accessibility.alt_text',
    version: 1,
    modelClassHint: 'google/gemini-2.5-pro',
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL or reference of the image.' },
        imageDescription: {
          type: 'string',
          description: 'Optional textual description of the image for context.',
        },
        slideContext: {
          type: 'string',
          description: 'Context of where the image appears in the slide.',
        },
      },
      required: ['imageUrl'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        altText: { type: 'string' },
        isDecorative: { type: 'boolean' },
        subject: { type: 'string' },
        action: { type: 'string' },
        context: { type: 'string' },
      },
    },
    evalSetId: 'eval-accessibility-alt-text-v1',
    systemPrompt:
      `You are an expert accessibility alt-text writer for Domio. ` +
      `Generate concise, descriptive alt text for images in a presentation context. ` +
      `Alt text must be under 280 characters, start with the subject (not "image of..."), ` +
      `and convey the image's purpose in the slide. ` +
      `If the image is purely decorative (gradient, pattern, background), set isDecorative=true ` +
      `and provide empty alt text. For charts and diagrams, include a structured summary ` +
      `plus a reference to the data table. Be specific about colors, spatial relationships, ` +
      `and data points when visible.`,
    userPromptTemplate:
      `Generate alt text for the following image:\n\n` +
      `Image URL: {imageUrl}\n` +
      `Image Description: {imageDescription}\n` +
      `Slide Context: {slideContext}`,
  },

  // -------------------------------------------------------------------------
  // 12. accessibility.captions
  // -------------------------------------------------------------------------
  {
    id: 'accessibility.captions',
    version: 1,
    modelClassHint: 'google/gemini-2.5-pro',
    inputSchema: {
      type: 'object',
      properties: {
        transcript: { type: 'string', description: 'Raw transcript from ASR.' },
        language: { type: 'string', description: 'Language code for the transcript.' },
        slideTimestamps: {
          type: 'string',
          description: 'Optional timestamps for slide boundaries.',
        },
      },
      required: ['transcript'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        captions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              startTimeMs: { type: 'number' },
              endTimeMs: { type: 'number' },
              text: { type: 'string' },
              speaker: { type: 'string' },
            },
          },
        },
        accuracy: { type: 'number' },
        language: { type: 'string' },
      },
    },
    evalSetId: 'eval-accessibility-captions-v1',
    systemPrompt:
      `You are an expert caption generator for Domio, a presentation platform. ` +
      `Convert a raw transcript into properly formatted captions with accurate timestamps. ` +
      `Split text at natural phrase boundaries (every 2-5 seconds). ` +
      `Each caption segment should be 1-2 lines, under 42 characters per line when possible. ` +
      `Preserve speaker labels when provided. ` +
      `Target ≥95% accuracy for clean audio. If the transcript has ambiguous words, ` +
      `use the surrounding context to disambiguate.`,
    userPromptTemplate:
      `Generate captions from the following transcript:\n\n` +
      `Language: {language}\n` +
      `Slide Timestamps: {slideTimestamps}\n\n` +
      `Transcript:\n{transcript}`,
  },

  // -------------------------------------------------------------------------
  // 13. freshness.check
  // -------------------------------------------------------------------------
  {
    id: 'freshness.check',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        citations: {
          type: 'string',
          description: 'List of citations with timestamps and source info.',
        },
        thresholdDays: { type: 'number', description: 'Freshness threshold in days.' },
        currentDate: { type: 'string', description: 'Current date (ISO format).' },
      },
      required: ['citations', 'currentDate'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        report: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              citationId: { type: 'string' },
              status: { type: 'string' },
              daysSinceVerified: { type: 'number' },
              freshnessScore: { type: 'number' },
              recommendation: { type: 'string' },
            },
          },
        },
        overallScore: { type: 'number' },
      },
    },
    evalSetId: 'eval-freshness-check-v1',
    systemPrompt:
      `You are an expert freshness auditor for Domio. ` +
      `Analyze citations and determine whether their underlying data is still current. ` +
      `For each citation, compute days since verification, apply the freshness threshold, ` +
      `and provide a freshness score using: freshness_score = 1 - (days_since_verified / threshold), ` +
      `clamped to [0, 1]. Status should be "fresh", "stale", or "unknown" (if source is offline). ` +
      `Provide a recommendation for each stale citation (e.g. "re-fetch source", "flag for review"). ` +
      `The overall score is the weighted average of individual scores.`,
    userPromptTemplate:
      `Check the freshness of the following citations:\n\n` +
      `Threshold: {thresholdDays} days\n` +
      `Current Date: {currentDate}\n\n` +
      `Citations:\n{citations}`,
  },

  // -------------------------------------------------------------------------
  // 14. lint.layout
  // -------------------------------------------------------------------------
  {
    id: 'lint.layout',
    version: 1,
    modelClassHint: 'openai/gpt-5.2-high',
    inputSchema: {
      type: 'object',
      properties: {
        slideLayout: {
          type: 'string',
          description: 'Description or JSON of the slide layout to lint.',
        },
        brandTokens: { type: 'string', description: 'Brand guidelines for validation.' },
        wcagLevel: { type: 'string', description: 'WCAG conformance level (default: "AA").' },
      },
      required: ['slideLayout'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              issueType: { type: 'string' },
              severity: { type: 'string' },
              description: { type: 'string' },
              autoFixable: { type: 'boolean' },
              confidence: { type: 'number' },
              fixProposal: { type: 'string' },
            },
          },
        },
        overallScore: { type: 'number' },
        wcagCompliant: { type: 'boolean' },
      },
    },
    evalSetId: 'eval-lint-layout-v1',
    systemPrompt:
      `You are an expert layout linter for Domio, a presentation platform. ` +
      `Analyze the given slide layout and identify issues including: text overflow, ` +
      `element overlap, orphan elements, alignment violations, color contrast violations ` +
      `(WCAG AA), missing alt text, broken data bindings, off-brand colors, and ` +
      `unreachable interactive elements. For each issue, provide a severity (critical/warning/info), ` +
      `whether it can be auto-fixed, a confidence score for the fix, and a concrete fix proposal. ` +
      `The overall score is 0-100 (100 = no issues). ` +
      `Report whether the layout meets WCAG 2.2 AA compliance.`,
    userPromptTemplate:
      `Lint the following slide layout:\n\n` +
      `WCAG Level: {wcagLevel}\n` +
      `Brand Tokens: {brandTokens}\n\n` +
      `Slide Layout:\n{slideLayout}`,
  },
];

// ---------------------------------------------------------------------------
// Registry access functions
// ---------------------------------------------------------------------------

/**
 * Get a prompt template by ID and optional version.
 *
 * @param id - Template identifier (e.g. "outline.from_prompt").
 * @param version - Optional version number. If omitted, returns the latest version.
 * @returns The matching PromptTemplate, or undefined if not found.
 * @throws TemplateNotFoundError if the template ID does not exist.
 *
 * **Versioning convention:** Templates are immutable once published. To create
 * a new version, add a new entry to TEMPLATES with the same `id` and an
 * incremented `version`. Consumers can pin to a specific version or request
 * the latest (version omitted). Old versions are retained for backward
 * compatibility.
 */
export function getTemplate(id: string, version?: number): PromptTemplate | undefined {
  const allIds = [...new Set(TEMPLATES.map((t) => t.id))];

  // Check if the template ID exists at all
  const candidates = TEMPLATES.filter((t) => t.id === id);
  if (candidates.length === 0) {
    throw new TemplateNotFoundError(id, allIds);
  }

  if (version !== undefined) {
    return candidates.find((t) => t.version === version);
  }

  // Return the latest version
  return candidates.sort((a, b) => b.version - a.version)[0];
}

/**
 * List all templates in the registry (latest version of each ID).
 *
 * @returns Array of PromptTemplate objects (one per unique ID, latest version).
 */
export function listTemplates(): PromptTemplate[] {
  const seen = new Set<string>();
  const result: PromptTemplate[] = [];

  // Sort by id, then by version descending, and take the first of each id
  const sorted = [...TEMPLATES].sort((a, b) =>
    a.id === b.id ? b.version - a.version : a.id.localeCompare(b.id),
  );

  for (const t of sorted) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      result.push(t);
    }
  }

  return result;
}
