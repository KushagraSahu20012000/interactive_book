import { lazy, Suspense, useEffect, useState } from "react";
import { TopNav } from "@/components/brainy/TopNav";
import { NavLink } from "@/components/NavLink";
import { clearSession, hasActiveSession, subscribeAuthStateChange } from "@/lib/auth";
import topicPresets from "@/data/topicPresets.json";
import { Bot, Puzzle, Target, Brain, Lightbulb, BookOpen, Sparkles } from "lucide-react";

const Mascot3D = lazy(() => import("@/components/brainy/Mascot3D").then((module) => ({ default: module.Mascot3D })));

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const features = [
  {
    icon: BookOpen,
    label: "Age-Appropriate Pacing",
    desc: "Tone, pacing, and examples shift with age so the same topic stays understandable as the learner grows.",
    bg: "bg-brainy-pink",
    rotate: "rotate-0 sm:-rotate-2",
  },
  {
    icon: Bot,
    label: "Skills Worth Practicing",
    desc: "The books focus on judgment-heavy skills: systems thinking, scientific reasoning, self-direction, and asking better questions.",
    bg: "bg-brainy-yellow",
    rotate: "rotate-0 sm:rotate-1",
  },
  {
    icon: Brain,
    label: "Thinking As A Skill",
    desc: "Bias awareness, logic, explanation, and mental models are treated as learnable skills, not vague traits.",
    bg: "bg-brainy-lime",
    rotate: "rotate-0 sm:-rotate-2",
  },
  {
    icon: Puzzle,
    label: "Different Minds, Different Pacing",
    desc: "Different learners need different pacing, framing, and texture. The format is built to respect that.",
    bg: "bg-brainy-sky",
    rotate: "rotate-0 sm:-rotate-1",
  },
  {
    icon: Target,
    label: "One Step At A Time",
    desc: "Pages build learning step by step so understanding compounds instead of collapsing into overload.",
    bg: "bg-brainy-coral",
    rotate: "rotate-0 sm:rotate-2",
  },
  {
    icon: Lightbulb,
    label: "Concrete Before Abstract",
    desc: "Important education starts with scenes, examples, and mechanisms you can actually picture.",
    bg: "bg-brainy-purple",
    rotate: "rotate-0 sm:-rotate-1",
  },
];

const workflowSteps = [
  {
    icon: Target,
    step: "01",
    title: "Choose the learner and topic",
    desc: "Pick what you want to explore, then match the book to age and learning profile.",
    bg: "bg-card",
    accent: "bg-brainy-yellow",
  },
  {
    icon: Sparkles,
    step: "02",
    title: "Generate the first version",
    desc: "The book starts with a clear structure and adds depth one learning step at a time.",
    bg: "bg-brainy-lime",
    accent: "bg-brainy-pink",
  },
  {
    icon: BookOpen,
    step: "03",
    title: "Read, pause, continue",
    desc: "Move page by page, let each lesson land, then continue when you are ready for the next layer.",
    bg: "bg-brainy-sky",
    accent: "bg-brainy-coral",
  },
];

const topicTags = topicPresets.map((topicPreset) => topicPreset.topic);

const Index = () => {
  const [hasSession, setHasSession] = useState(hasActiveSession());
  const [showMascot, setShowMascot] = useState(false);

  useEffect(() => subscribeAuthStateChange(() => setHasSession(hasActiveSession())), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const idleWindow = window as IdleWindow;
    const onIdle = () => setShowMascot(true);

    if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(onIdle, { timeout: 800 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(onIdle, 150);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 grid lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-6">
          <div className="inline-block bg-brainy-pink brutal-border brutal-shadow-sm px-4 py-1 font-display uppercase text-sm text-primary-foreground">
            <Sparkles className="inline w-4 h-4 mr-1" strokeWidth={3} /> Learning for the post-AI world
          </div>
          <h1 className="font-display text-5xl sm:text-[5rem] lg:text-[6rem] uppercase leading-[0.9]">
            Learn <span className="bg-brainy-yellow brutal-border px-3 inline-block -rotate-2 brutal-shadow-sm">Bold.</span>
            <span className="block mt-2 sm:mt-3">
              Stay <span className="bg-brainy-sky brutal-border px-3 inline-block rotate-1 brutal-shadow-sm">Curious.</span>
            </span>
          </h1>
          <p className="text-lg sm:text-xl max-w-xl font-body font-bold leading-relaxed">
            Bright Minds is a post-AI learning platform with clear, age-aware books that build understanding step by step.
          </p>
          <div className="flex flex-col md:flex-row md:flex-nowrap gap-3 pt-2 max-w-sm md:max-w-none">
            <NavLink
              to="/books"
              data-sfx="primary"
              className="w-full md:w-auto text-center font-display uppercase px-6 py-3 bg-brainy-pink text-primary-foreground brutal-border brutal-shadow brutal-press text-base"
            >
              Open The Bookshelf
            </NavLink>
            <a
              href="#how-it-works"
              data-sfx="nav"
              className="w-full md:w-auto text-center font-display uppercase px-6 py-3 bg-card brutal-border brutal-shadow brutal-press text-base"
            >
              See How It Works
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-square max-w-[500px] mx-auto brutal-border brutal-shadow-lg overflow-hidden bg-brainy-lime">
            <div className="pointer-events-none absolute right-3 top-3 z-20 bg-card brutal-border brutal-shadow-sm px-2 py-1 font-display uppercase text-[10px] sm:text-xs leading-none">
              Brainy
            </div>
            {showMascot ? (
              <Suspense fallback={<div className="h-full w-full bg-brainy-lime" />}>
                <Mascot3D />
              </Suspense>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-brainy-lime">
                <div className="h-28 w-28 rounded-full brutal-border bg-card/60 brutal-shadow-sm" />
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="topics" className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="bg-card brutal-border brutal-shadow p-6 sm:p-8">
          <div className="inline-block bg-brainy-lime brutal-border px-3 py-1 font-display uppercase text-sm mb-4">
            What you can explore
          </div>
          <h2 className="font-display text-3xl sm:text-5xl uppercase leading-tight mb-4">
            Learning for the subjects that shape real life.
          </h2>
          <p className="font-body font-bold text-base sm:text-lg max-w-4xl leading-relaxed mb-6">
            Instead of generic trivia, Bright Minds focuses on the education people actually need: systems, bias, health, environment, self-knowledge, and the habits of clear thinking.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topicTags.map((topic) => (
              <span
                key={topic}
                className="w-full px-4 py-2 font-display uppercase text-xs sm:text-sm leading-tight text-center whitespace-normal break-words bg-brainy-yellow brutal-border brutal-shadow-sm"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
          <div>
            <div className="inline-block bg-brainy-yellow brutal-border px-3 py-1 font-display uppercase text-sm mb-4">
              How it works
            </div>
            <h2 className="font-display text-3xl sm:text-5xl uppercase leading-tight">
              How a book takes shape.
            </h2>
          </div>
          <p className="font-body font-bold text-base sm:text-lg max-w-2xl leading-relaxed">
            Pick what you want to learn, let the book take shape, and keep going as the learning deepens instead of arriving all at once.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.step} className={`${step.bg} brutal-border brutal-shadow p-6`}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className={`${step.accent} brutal-border w-14 h-14 flex items-center justify-center`}>
                    <Icon className="w-7 h-7" strokeWidth={2.5} />
                  </div>
                  <span className="font-display text-3xl uppercase leading-none">{step.step}</span>
                </div>
                <h3 className="font-display text-2xl uppercase leading-tight mb-2">{step.title}</h3>
                <p className="font-body font-bold text-base leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-3xl mb-10">
          <div className="inline-block bg-brainy-coral brutal-border px-3 py-1 font-display uppercase text-sm mb-4">
            Why it helps
          </div>
          <h2 className="font-display text-4xl sm:text-6xl uppercase mb-4 leading-tight">
            A format that helps learning stick.
          </h2>
          <p className="font-body font-bold text-base sm:text-lg leading-relaxed">
            The point is not more content. It is slower, clearer understanding that keeps building from page to page.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className={`${f.bg} ${f.rotate} brutal-border brutal-shadow p-6 brutal-press ${i % 2 === 0 ? "" : "sm:mt-6"}`}
              >
                <div className="bg-card brutal-border w-14 h-14 flex items-center justify-center mb-4">
                  <Icon className="w-7 h-7" strokeWidth={2.5} />
                </div>
                <h3 className="font-display text-2xl uppercase leading-tight mb-2">{f.label}</h3>
                <p className="font-body font-bold text-base">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {hasSession ? (
        <div className="fixed bottom-4 right-4 z-40 flex items-end justify-end">
          <button
            type="button"
            data-sfx="destructive"
            onClick={() => clearSession()}
            className="bg-card brutal-border brutal-shadow-sm brutal-press px-3 py-2 font-display uppercase text-xs sm:text-sm"
          >
            Logout
          </button>
        </div>
      ) : null}

      {/* ABOUT */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-brainy-purple brutal-border brutal-shadow p-8 text-card">
            <div className="bg-card text-foreground brutal-border inline-block px-3 py-1 font-display uppercase text-sm mb-4">
              Why it exists
            </div>
            <h2 className="font-display text-4xl sm:text-5xl uppercase mb-4 leading-tight">
              Why this matters now.
            </h2>
            <p className="font-body font-bold text-lg leading-relaxed">
              In a post-AI world, answers are easy to get. The harder part is learning how to judge what matters, what to question, and how to understand a system instead of memorizing fragments. Bright Minds is built to support that kind of learning.
            </p>
          </div>

          <div className="bg-brainy-sky brutal-border brutal-shadow p-8">
            <div className="bg-card brutal-border inline-block px-3 py-1 font-display uppercase text-sm mb-4">
              What each book tries to do
            </div>
            <ul className="space-y-4 font-body font-bold text-lg">
              <li className="flex items-start gap-4">
                <div className="bg-brainy-yellow brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Give one lesson enough space to land instead of rushing past it.</span>
              </li>
              <li className="flex items-start gap-4">
                <div className="bg-brainy-pink brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <Brain className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Adapt tone, pacing, and examples to age and neurotype.</span>
              </li>
              <li className="flex items-start gap-4">
                <div className="bg-brainy-lime brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Move from concrete scenes to deeper understanding without losing clarity.</span>
              </li>
              <li className="flex items-start gap-4">
                <div className="bg-brainy-coral brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Keep learning connected to real decisions, real life, and better questions.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="bg-brainy-coral brutal-border brutal-shadow p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="inline-block bg-card brutal-border px-3 py-1 font-display uppercase text-sm mb-4">
              Start with a sample
            </div>
            <h2 className="font-display text-3xl sm:text-5xl uppercase leading-tight mb-3">
              Start with a book.
            </h2>
            <p className="font-body font-bold text-base sm:text-lg max-w-2xl leading-relaxed">
              Read a few sample books first. If the format feels right, make one of your own.
            </p>
          </div>
          <NavLink
            to="/books"
            className="font-display uppercase px-6 py-3 bg-card brutal-border brutal-shadow brutal-press text-lg text-center"
          >
            Go To The Bookshelf
          </NavLink>
        </div>
      </section>

      <footer className="border-t-[4px] border-foreground bg-brainy-yellow py-6 mt-10">
        <p className="text-center font-display uppercase text-sm">
          © Bright Minds — Stay curious, Stay bold.
        </p>
      </footer>
    </div>
  );
};

export default Index;
