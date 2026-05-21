import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';

interface CopilotChatProps {
  latestAlert: any;
  latestCopilot: any;
}

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
}

const SUGGESTED_QUESTIONS = [
  'Why is this happening?',
  'What should I check first?',
  'How urgent is this?',
  'Show me the evidence',
];

const GREETING =
  "Hello! I'm your CoolingOps AI Copilot. I have full awareness of the current plant state, active faults, and sensor readings. What would you like to know?";

const rawBaseUrl = import.meta.env.VITE_API_URL;
const API_BASE = rawBaseUrl !== undefined ? rawBaseUrl : 'http://localhost:8000';

function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  };
}

export function CopilotChat({ latestAlert, latestCopilot }: CopilotChatProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const context = useMemo(
    () => ({
      fault_type: latestAlert?.fault_type ?? null,
      confidence: latestAlert?.confidence ?? null,
      degradation_score: latestAlert?.degradation_score ?? null,
      gate_scores: latestAlert?.gate_scores ?? null,
      component: latestAlert?.component ?? null,
      reasoning: latestCopilot?.reasoning ?? null,
    }),
    [latestAlert, latestCopilot],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isLoading) {
        return;
      }

      setMessages((current) => [...current, createMessage('user', trimmed)]);
      setInput('');
      setIsLoading(true);

      try {
        const response = await fetch(`${API_BASE}/api/copilot/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: trimmed,
            context,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setMessages((current) => [
          ...current,
          createMessage('bot', String(data?.answer ?? "I'm having trouble connecting. Please try again.")),
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          createMessage('bot', "I'm having trouble connecting. Please try again."),
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [context, isLoading],
  );

  return (
    <div className="rounded-[30px] border border-border bg-panel/88 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold text-ink">
            <span>AI Copilot</span>
          </h2>
        </div>
        <div className="rounded-full border border-cyan/20 bg-cyan/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-cyan">
          Powered by DeepSeek on Huawei ModelArts
        </div>
      </div>

      <div className="rounded-[28px] border border-border bg-[#0d1524] p-4">
        <div className="scrollbar-thin max-h-[420px] space-y-4 overflow-y-auto pr-2">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan">
              <Bot className="h-5 w-5" />
            </div>
            <div className="max-w-[88%] rounded-[24px] rounded-tl-sm border border-border bg-panel/80 px-4 py-3 text-sm leading-6 text-ink">
              {GREETING}
            </div>
          </div>

          {messages.map((message) =>
            message.role === 'bot' ? (
              <div key={message.id} className="flex items-start gap-3">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="max-w-[88%] rounded-[24px] rounded-tl-sm border border-border bg-panel/80 px-4 py-3 text-sm leading-6 text-ink">
                  {message.text}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[78%] rounded-[24px] rounded-tr-sm bg-cyan px-4 py-3 text-sm leading-6 text-night">
                  {message.text}
                </div>
              </div>
            ),
          )}

          {isLoading ? (
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="rounded-[24px] rounded-tl-sm border border-border bg-panel/80 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan [animation-delay:0ms]" />
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan [animation-delay:180ms]" />
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan [animation-delay:360ms]" />
                </div>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => void sendQuestion(question)}
              className="rounded-full border border-border bg-night/70 px-3 py-1.5 text-sm text-muted transition hover:border-cyan/30 hover:bg-cyan/10 hover:text-cyan"
            >
              {question}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendQuestion(input);
              }
            }}
            placeholder="Ask about the plant, active faults, or supporting evidence..."
            className="h-12 flex-1 rounded-2xl border border-border bg-night/70 px-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-cyan/40"
          />
          <button
            type="button"
            onClick={() => void sendQuestion(input)}
            disabled={isLoading || !input.trim()}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-cyan/30 bg-cyan/10 px-4 text-sm font-medium text-cyan transition hover:bg-cyan/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
