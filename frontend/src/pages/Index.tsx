import { TopNav } from "@/components/brainy/TopNav";
import { Mascot3D } from "@/components/brainy/Mascot3D";
import { NavLink } from "@/components/NavLink";
import { Bot, Puzzle, Target, Brain, Lightbulb, BookOpen, Sparkles } from "lucide-react";

const features = [
  {
    icon: BookOpen,
    label: "Age-Based Learning",
    desc: "The format changes with age, so learning stays interesting instead of turning into a chore.",
    bg: "bg-brainy-pink",
    rotate: "-rotate-2",
  },
  {
    icon: Bot,
    label: "Post-AI Curriculum",
    desc: "Teach what matters after automation: judgment, systems thinking, scientific reasoning, and human depth.",
    bg: "bg-brainy-yellow",
    rotate: "rotate-1",
  },
  {
    icon: Brain,
    label: "Real Cognitive Skills",
    desc: "Cognitive bias, logical thinking, the scientific method, self-awareness, and better mental models.",
    bg: "bg-brainy-lime",
    rotate: "-rotate-2",
  },
  {
    icon: Puzzle,
    label: "Neurotype-Aware",
    desc: "Designed for different ways of focusing, processing, and understanding so more learners can stay with the idea.",
    bg: "bg-brainy-sky",
    rotate: "-rotate-1",
  },
  {
    icon: Target,
    label: "Concept Progression",
    desc: "Each page advances one concept at a time, helping understanding compound instead of collapsing into overload.",
    bg: "bg-brainy-coral",
    rotate: "rotate-2",
  },
  {
    icon: Lightbulb,
    label: "First-Principles Clarity",
    desc: "Big ideas get broken into concrete scenes, scenarios, and explanations that make the mechanism visible.",
    bg: "bg-brainy-purple",
    rotate: "-rotate-1",
  },
];

const topicTags = [
  "Critical Thinking",
  "Systems Thinking",
  "Logical Thinking",
  "Scientific Method",
  "Cognitive Bias",
  "Emergence",
  "Quantum Reality",
  "Environment",
  "Self-Knowledge",
  "Mental Health",
  "Neuroscience",
  "Nutrition",
  "Physical Health",
  "Sex & Gender Education",
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 grid lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-6">
          <div className="inline-block bg-brainy-pink brutal-border brutal-shadow-sm px-4 py-1 font-display uppercase text-sm text-primary-foreground">
            <Sparkles className="inline w-4 h-4 mr-1" strokeWidth={3} /> For curious humans
          </div>
          <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl uppercase leading-[0.9]">
            Learn <span className="bg-brainy-yellow brutal-border px-3 inline-block -rotate-2 brutal-shadow-sm">Loud.</span>
            <br />
            Think <span className="bg-brainy-sky brutal-border px-3 inline-block rotate-1 brutal-shadow-sm">Big.</span>
          </h1>
          <p className="text-lg sm:text-xl max-w-xl font-body font-bold leading-relaxed">
            Bright Minds is a colorful learning playground for the post-AI era, built to keep learning interesting, age-aware, and focused on the human skills AI cannot replace.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <NavLink
              to="/books"
              className="font-display uppercase px-6 py-3 bg-brainy-pink text-primary-foreground brutal-border brutal-shadow brutal-press text-lg"
            >
              Open the Bookshelf →
            </NavLink>
            <a
              href="#features"
              className="font-display uppercase px-6 py-3 bg-card brutal-border brutal-shadow brutal-press text-lg"
            >
              See Features
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-square max-w-[500px] mx-auto brutal-border brutal-shadow-lg overflow-hidden bg-brainy-lime">
            <Mascot3D />
          </div>
          <div className="absolute -bottom-3 -left-3 bg-brainy-yellow brutal-border brutal-shadow-sm px-3 py-1 font-display uppercase text-sm rotate-[-4deg]">
            Drag me!
          </div>
        </div>
      </section>

      <section id="topics" className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="bg-card brutal-border brutal-shadow p-6 sm:p-8">
          <div className="inline-block bg-brainy-lime brutal-border px-3 py-1 font-display uppercase text-sm mb-4">
            What post-AI learning includes
          </div>
          <h2 className="font-display text-3xl sm:text-5xl uppercase leading-tight mb-4">
            Teach the ideas that actually matter.
          </h2>
          <p className="font-body font-bold text-base sm:text-lg max-w-4xl leading-relaxed mb-6">
            Bright Minds focuses on the subjects most schools often flatten, delay, or ignore: thinking clearly, understanding systems, understanding yourself, and living well inside a complex world.
          </p>
          <div className="flex flex-wrap gap-3">
            {topicTags.map((topic) => (
              <span
                key={topic}
                className="px-4 py-2 font-display uppercase text-sm bg-brainy-yellow brutal-border brutal-shadow-sm"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="font-display text-4xl sm:text-6xl uppercase mb-10">
          What makes <span className="bg-brainy-coral brutal-border px-2 inline-block -rotate-1">Bright Minds</span> work?
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className={`${f.bg} ${f.rotate} brutal-border brutal-shadow p-6 brutal-press`}
                style={{ marginTop: i % 2 === 0 ? "0" : "1.5rem" }}
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

      {/* ABOUT */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-brainy-purple brutal-border brutal-shadow p-8 text-card">
            <div className="bg-card text-foreground brutal-border inline-block px-3 py-1 font-display uppercase text-sm mb-4">
              From the Creator
            </div>
            <h2 className="font-display text-4xl sm:text-5xl uppercase mb-4 leading-tight">
              Made for the new generation that will shape the future.
            </h2>
            <p className="font-body font-bold text-lg leading-relaxed">
              Bright Minds starts from a simple belief: when AI can generate answers instantly, education has to do more than hand out information. It has to build judgment, self-knowledge, clearer thinking, stronger agency, and the kind of intellectual character that still matters when the tools get smarter.
            </p>
          </div>

          <div className="bg-brainy-sky brutal-border brutal-shadow p-8">
            <div className="bg-card brutal-border inline-block px-3 py-1 font-display uppercase text-sm mb-4">
              How it's built
            </div>
            <ul className="space-y-4 font-body font-bold text-lg">
              <li className="flex items-start gap-4">
                <div className="bg-brainy-yellow brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Uses better learning methods so ideas stay engaging, memorable, and easier to carry forward.</span>
              </li>
              <li className="flex items-start gap-4">
                <div className="bg-brainy-pink brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <Brain className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Progresses one concept at a time, so depth builds naturally instead of dumping complexity all at once.</span>
              </li>
              <li className="flex items-start gap-4">
                <div className="bg-brainy-lime brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Uses first-principles thinking, concrete examples, and vivid formats to make important ideas actually click.</span>
              </li>
              <li className="flex items-start gap-4">
                <div className="bg-brainy-coral brutal-border w-12 h-12 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <span>Focuses on things that matter in real life: reasoning, health, environment, self-knowledge, and human development.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t-[4px] border-foreground bg-brainy-yellow py-6 mt-10">
        <p className="text-center font-display uppercase text-sm">
          © Bright Minds — Stay curious, stay loud.
        </p>
      </footer>
    </div>
  );
};

export default Index;
